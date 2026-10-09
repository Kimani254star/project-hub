/* Public home page: single-view navigation, same behaviour as the Support site */
  function hpMore(btn){
    var card=btn.closest('.hp-tier');
    var open=card.classList.toggle('hp-open');
    btn.innerHTML=open?'Show less &#9652;':'Show '+btn.getAttribute('data-n')+' more features &#9662;';
  }
  function hpBillingToggle(){
    var yearly=document.getElementById('hpBilling').checked;
    document.querySelectorAll('#homePage .hp-amt').forEach(function(el){
      var p=yearly?+el.getAttribute('data-year'):+el.getAttribute('data-month');
      el.textContent='KES '+p.toLocaleString('en-US');
      var per=el.parentElement.querySelector('.hp-per');
      if(per) per.textContent=yearly?'/yr':'/mo';
    });
  }
(function(){
  var root=document.getElementById('homePage');
  var slides=root.querySelectorAll('.hp-slide'),si=0;
  setInterval(function(){
    if(root.style.display!=='block'||slides.length<2) return;
    slides[si].classList.remove('active'); si=(si+1)%slides.length; slides[si].classList.add('active');
  },5000);
  var nav=document.getElementById('hpNav'),burger=document.getElementById('hpBurger');
  burger.addEventListener('click',function(){
    var open=nav.classList.toggle('open');
    burger.setAttribute('aria-expanded',open?'true':'false');
  });
  var pages=root.querySelectorAll('.hp-page');
  var valid={top:1,about:1,features:1,process:1,pricing:1,faq:1,contact:1};
  function show(id){
    if(!valid[id]) id='top';
    pages.forEach(function(p){p.classList.toggle('hp-active',p.getAttribute('data-page')===id);});
    root.querySelectorAll('.hp-nav a').forEach(function(a){a.classList.toggle('hp-current',a.getAttribute('href')==='#'+id);});
    nav.classList.remove('open'); burger.setAttribute('aria-expanded','false');
    root.scrollTop=0;
  }
  root.querySelectorAll('a[data-scroll]').forEach(function(a){
    a.addEventListener('click',function(e){ e.preventDefault(); show(a.getAttribute('href').slice(1)); });
  });
  var y=document.getElementById('footerYear'); if(y) y.textContent=new Date().getFullYear();
  show('top');
  window.hpShowPage=show;
})();
function hpShowHome(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('homePage').style.display='block';
  window.hpShowPage&&window.hpShowPage('top');
}
function hpHideHome(){ document.getElementById('homePage').style.display='none'; }
function hpShowLogin(tab){
  hpHideHome();
  document.getElementById('authScreen').style.display='flex';
  switchAuthTab(tab||'login');
}
function hpTheme(){
  if(typeof toggleTheme==='function'){ toggleTheme(); return; }
  var h=document.documentElement;
  if(h.getAttribute('data-theme')==='dark') h.removeAttribute('data-theme'); else h.setAttribute('data-theme','dark');
}
function hpContact(e){
  e.preventDefault();
  var n=document.getElementById('hpName').value.trim(), m=document.getElementById('hpEmail').value.trim(), t=document.getElementById('hpMsg').value.trim();
  var body='From: '+n+' <'+m+'>\n\n'+t;
  window.location.href='mailto:hello@example.com?subject='+encodeURIComponent('Acacia Projects enquiry')+'&body='+encodeURIComponent(body);
  document.getElementById('contactConfirm').classList.remove('hidden');
  return false;
}

;
/* ===== acacia-cloud: shared Supabase layer for the Acacia apps (same project as Books) =====
   - Sign in / sign up against the same accounts Books uses (table app_accounts)
   - New companies + users show up in Support (acacia_company_status, app_accounts, acacia_app_usage)
   - Each app's data is saved per company in acacia_app_data and loaded on any device
   Needs acacia_apps_cloud.sql to be run once in Supabase. Offline: falls back to this browser's copy. */
(function (w) {
  'use strict';
  var URL_ = 'https://xglsampckermarjpczdf.supabase.co';
  var KEY_ = 'sb_publishable_x-dPR7pzhvJgag9soW0I8w_yfKTmi6A';
  var H = { apikey: KEY_, Authorization: 'Bearer ' + KEY_, 'Content-Type': 'application/json' };
  var cfg = null, ctx = null, timer = 0, hbTimer = 0;
  var rawSet = Storage.prototype.setItem;
  var low = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  var enc = encodeURIComponent;
  var isCloudId = function (id) { return /^ACC-\d+$/i.test(String(id || '')); };
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  async function req(path, opt) {
    var ctl = w.AbortController ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 12000) : null;
    try {
      var r = await fetch(URL_ + '/rest/v1/' + path, Object.assign({ headers: H, signal: ctl ? ctl.signal : undefined }, opt || {}));
      if (t) clearTimeout(t);
      return r;
    } catch (e) { if (t) clearTimeout(t); throw err('offline', 'Cannot reach the Acacia cloud. Check your internet connection.'); }
  }
  async function rpc(name, args) {
    var r = await req('rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) });
    var j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      var m = (j && (j.message || j.hint)) || ('HTTP ' + r.status);
      var e = err(/already exists|exists/i.test(m) ? 'exists' : (r.status === 404 ? 'missing' : 'rpc'), m); e.status = r.status; throw e;
    }
    return j;
  }

  /* same hashing as Books: SHA-256 of "salt:password" */
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function newSalt() { var a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
  async function hash(pass, salt) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pass))); }
  async function verify(d, pass) {
    d = d || {};
    if (d.passwordHash && d.passwordSalt) return (await hash(pass, d.passwordSalt)) === d.passwordHash;
    return typeof d.password === 'string' && d.password === pass;
  }
  function mapRole(r, d) { return cfg && cfg.mapRole ? cfg.mapRole(r, d) : (/^admin/i.test(String(r || '')) ? 'Administrator' : (r || 'Administrator')); }

  /* deleted / suspended companies are blocked (fails open if the cloud can't be reached) */
  async function gate(cid, login) {
    try { if ((await rpc('acx_account_state', { p_company: low(cid), p_login: low(login) })) === 'deleted') return 'This account was removed by Acacia support.'; } catch (e) {}
    try {
      var r = await req('acacia_company_status?select=status&company_id=eq.' + enc(cid));
      if (r.ok) { var j = await r.json(); var s = j[0] && j[0].status; if (s === 'pending') return 'Your company is waiting for approval by Acacia support. You will be able to sign in as soon as it is approved.'; if (s && s !== 'active') return 'Your company account is "' + s + '". Please contact Acacia support.'; }
    } catch (e) {}
    return null;
  }

  async function signIn(email, pass, company) {
    email = low(email);
    var r = await req('app_accounts?select=login_id,username,company_id,data&login_id=eq.' + enc(email));
    if (!r.ok) throw err('offline', 'Could not read accounts (' + r.status + '). Run acacia_apps_cloud.sql in Supabase.');
    var rows = await r.json(), ok = [], cn = low(company);
    if (cn) rows = rows.filter(function (x) { var d = x.data || {}; return low(d.companyName) === cn || low(x.company_id) === cn || (d.previousCompanyNames || []).map(low).indexOf(cn) > -1; });
    for (var i = 0; i < rows.length; i++) if (await verify(rows[i].data, pass)) ok.push(rows[i]);
    if (!ok.length) return null;
    var row = ok[0];
    if (ok.length > 1) {
      var pick = w.prompt('This login belongs to more than one company:\n' + ok.map(function (x, n) { return (n + 1) + '. ' + ((x.data && x.data.companyName) || x.company_id) + ' (' + x.company_id + ')'; }).join('\n') + '\n\nType the number to open:', '1');
      row = ok[(parseInt(pick, 10) || 1) - 1] || ok[0];
    }
    var msg = await gate(row.company_id, email); if (msg) throw err('blocked', msg);
    var d = row.data || {};
    return { companyId: row.company_id, company: d.companyName || '', name: d.fullName || d.username || email.split('@')[0], email: email, role: mapRole(d.role, d), passwordHash: d.passwordHash, passwordSalt: d.passwordSalt };
  }

  async function register(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    var id = await rpc('acx_register_company', { p_company: o.company, p_name: o.name, p_email: low(o.email), p_hash: h, p_salt: salt, p_app: cfg.app, p_plan: o.plan || '', p_billing: o.billing || 'monthly' });
    var blocked = await gate(id, o.email);
    return { companyId: id, passwordHash: h, passwordSalt: salt, blocked: blocked };
  }

  /* teammates added inside an app (CRM Users & Roles). The app's own role is kept per app; Books sees admin/user */
  var booksRole = function (r) { return /^admin/i.test(String(r || '')) ? 'admin' : 'user'; };
  async function addUser(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    await rpc('acx_add_user', { p_company: o.companyId, p_name: o.name, p_email: low(o.email), p_role: booksRole(o.role), p_hash: h, p_salt: salt, p_app: cfg.app, p_app_role: o.role || '' });
    return { passwordHash: h, passwordSalt: salt };
  }
  function setRole(companyId, email, role) { return rpc('acx_set_user_role', { p_company: companyId, p_email: low(email), p_role: booksRole(role), p_app: cfg.app, p_app_role: role || '' }); }
  function removeUser(companyId, email) { return rpc('acx_remove_user', { p_company: companyId, p_email: low(email) }); }

  /* keep a copy of cloud users in this browser so the app's own session code keeps working (and offline sign-in) */
  function cacheUser(usersKey, u) {
    try {
      var list = JSON.parse(localStorage.getItem(usersKey) || '[]');
      var rec = { companyId: u.companyId, company: u.company, name: u.name, email: low(u.email), role: u.role, passwordHash: u.passwordHash, passwordSalt: u.passwordSalt };
      var i = list.findIndex(function (x) { return low(x.email) === rec.email && x.companyId === rec.companyId; });
      if (i > -1) { list[i] = Object.assign({}, list[i], rec); delete list[i].password; } else list.push(rec);
      rawSet.call(localStorage, usersKey, JSON.stringify(list));
    } catch (e) {}
  }
  function verifyLocal(u, pass) { return verify(u, pass); }

  /* accounts that only ever existed in this browser get a cloud company; their data and teammates move with them.
     'all' is the local users array: it is updated in place (caller saves it). Returns the signed-in user's new record. */
  async function migrate(u, pass, all) {
    var oldId = u.companyId, same = (all || [u]).filter(function (x) { return x.companyId === oldId; });
    var owner = same.find(function (x) { return /^admin/i.test(String(x.role || 'Administrator')) && x.password; }) || u;
    var ownerPass = owner === u ? pass : owner.password;
    var r = await register({ company: owner.company, name: owner.name, email: owner.email, password: ownerPass });
    for (var i = 0; i < same.length; i++) {
      var x = same[i];
      if (x === owner) { x.passwordHash = r.passwordHash; x.passwordSalt = r.passwordSalt; }
      else {
        var pw = x === u ? pass : x.password;
        if (pw) { try { var h = await addUser({ companyId: r.companyId, name: x.name, email: x.email, password: pw, role: x.role || 'Administrator' }); x.passwordHash = h.passwordHash; x.passwordSalt = h.passwordSalt; } catch (e) { continue; } }
        else continue;
      }
      delete x.password; x.companyId = r.companyId;
    }
    var o = cfg.dataKey(oldId), n = cfg.dataKey(r.companyId), v = localStorage.getItem(o);
    if (v != null) { rawSet.call(localStorage, n, v); localStorage.removeItem(o); rawSet.call(localStorage, dirtyKey(r.companyId), '1'); }
    return same.find(function (x) { return low(x.email) === low(u.email) && x.companyId === r.companyId; }) || null;
  }

  /* ---- data sync (one JSON blob per company per app) ---- */
  function tsKey(c) { return 'acx_ts_' + cfg.app + '_' + (c || ctx.companyId); }
  function dirtyKey(c) { return 'acx_dirty_' + cfg.app + '_' + (c || ctx.companyId); }
  async function pullRow(app) {
    var r = await req('acacia_app_data?select=value,updated_at&key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(app));
    if (!r.ok) return null; var j = await r.json(); return j[0] || null;
  }
  async function pushNow() {
    if (!ctx || !isCloudId(ctx.companyId)) return false;
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)); if (v == null) return false;
    try {
      var r = await req('acacia_app_data?on_conflict=company_id,app,key', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v }) });
      if (r.ok) { var j = await r.json(); rawSet.call(localStorage, tsKey(), (j[0] && j[0].updated_at) || ''); localStorage.removeItem(dirtyKey()); return true; }
    } catch (e) {}
    return false;
  }
  function schedule() {
    if (!ctx || !isCloudId(ctx.companyId)) return;
    rawSet.call(localStorage, dirtyKey(), '1');
    clearTimeout(timer); timer = setTimeout(pushNow, 2500);
  }
  function flush() {
    if (!ctx || !isCloudId(ctx.companyId) || localStorage.getItem(dirtyKey()) !== '1') return;
    clearTimeout(timer);
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)); if (v == null) return;
    try {
      fetch(URL_ + '/rest/v1/acacia_app_data?on_conflict=company_id,app,key', { method: 'POST', keepalive: v.length < 60000, headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v }) }).then(function (r) { if (r.ok) localStorage.removeItem(dirtyKey()); }).catch(function () {});
    } catch (e) {}
  }
  async function pullData() {
    var row = await pullRow(cfg.app);
    var dirty = localStorage.getItem(dirtyKey()) === '1', last = localStorage.getItem(tsKey());
    if (row && !dirty && row.updated_at !== last) { rawSet.call(localStorage, cfg.dataKey(ctx.companyId), row.value); rawSet.call(localStorage, tsKey(), row.updated_at); }
    else if (!row) { if (localStorage.getItem(cfg.dataKey(ctx.companyId)) != null) await pushNow(); }
    else if (dirty) await pushNow();
  }
  /* read-only copies of another app's data (e.g. Expenses reads Payroll) */
  async function pullExtras() {
    var ex = cfg.readFrom || [];
    for (var i = 0; i < ex.length; i++) { try { var row = await pullRow(ex[i].app); if (row) rawSet.call(localStorage, ex[i].dataKey(ctx.companyId), row.value); } catch (e) {} }
  }

  function heartbeat() {
    if (!ctx || !isCloudId(ctx.companyId) || !ctx.email) return;
    var k = 'acx_hb_' + ctx.companyId + '_' + cfg.app + '_' + ctx.email;
    if (Date.now() - Number(localStorage.getItem(k) || 0) < 3e5) return;
    rawSet.call(localStorage, k, String(Date.now()));
    try { fetch(URL_ + '/rest/v1/rpc/acx_heartbeat', { method: 'POST', headers: H, keepalive: true, body: JSON.stringify({ p_company: ctx.companyId, p_app: cfg.app, p_user: ctx.email, p_role: String(ctx.role || '') }) }).catch(function () {}); } catch (e) {}
  }

  /* called when a user enters the app: returns 'ok' | 'local' | 'blocked:<message>' */
  async function start(user) {
    ctx = { companyId: user.companyId, email: low(user.email), role: user.role || '' };
    if (!isCloudId(ctx.companyId)) return 'local';
    var msg = await gate(ctx.companyId, ctx.email); if (msg) return 'blocked:' + msg;
    try { await pullData(); await pullExtras(); } catch (e) {}
    heartbeat(); clearInterval(hbTimer); hbTimer = setInterval(function () { heartbeat(); }, 3e5);
    return 'ok';
  }
  function stop() { flush(); clearInterval(hbTimer); ctx = null; }

  function init(c) {
    cfg = c;
    Storage.prototype.setItem = function (k, v) {
      rawSet.apply(this, arguments);
      try { if (this === w.localStorage && ctx && k === cfg.dataKey(ctx.companyId)) schedule(); } catch (e) {}
    };
    w.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  }

  /* sign-up plan note: reads #regPlan / #regBilling and shows what the company will pay */
  w.acxPlanChanged = function () {
    var s = document.getElementById('regPlan'), b = document.getElementById('regBilling'), n = document.getElementById('regPlanNote');
    if (!s || !n) return;
    var o = s.options[s.selectedIndex], p = Number((o && o.getAttribute('data-price')) || 0), y = !!b && b.value === 'yearly';
    var f = function (x) { return 'KES ' + x.toLocaleString('en-US'); };
    n.textContent = y ? f(p * 10) + ' for the year (2 months free). Billed after Acacia support approves your account.' : f(p) + ' per month. Billed after Acacia support approves your account.';
  };
  setTimeout(function () { try { if (w.acxPlanChanged) w.acxPlanChanged(); } catch (e) {} }, 0);

  w.AcaciaCloud = { init: init, signIn: signIn, register: register, addUser: addUser, setRole: setRole, removeUser: removeUser, cacheUser: cacheUser, verifyLocal: verifyLocal, migrate: migrate, start: start, stop: stop, flush: flush, isCloudId: isCloudId, gate: gate, URL: URL_, KEY: KEY_, rpc: rpc, req: req };
})(window);
;
/* =========================================================
   ACACIA PROJECTS — data model & state
========================================================= */
const STORAGE_KEY = 'acaciaProjectsData_v1';

const DEFAULT_SETTINGS = {
  company: { name:'', address:'', phone:'', email:'', currency:'KES' },
  projectStatuses: ['Planning','Not Started','In Progress','On Hold','Completed','Cancelled'],
  taskStatuses: ['To Do','In Progress','Review','Completed'],
  milestoneStatuses: ['Not Started','In Progress','Completed'],
  issueStatuses: ['Open','Investigating','In Progress','Resolved','Closed'],
  priorities: ['Low','Medium','High','Urgent'],
  projectRoles: ['Administrator','Project Manager','Team Lead','Project Member','Viewer'],
  workHoursPerDay: 8,
  projectNumberingPrefix: 'PRJ-',
  nextProjectNumber: 1
};

function freshState(){
  return {
    projects: [],
    tasks: [],
    milestones: [],
    team: [],
    timeEntries: [],
    documents: [],
    issues: [],
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  };
}

let state = null;

function dataKeyFor(companyId){ return STORAGE_KEY + '_' + companyId; }

function loadState(companyId){
  try{
    const raw = localStorage.getItem(dataKeyFor(companyId));
    if(!raw) return freshState();
    const parsed = JSON.parse(raw);
    const base = freshState();
    return Object.assign(base, parsed, { settings: Object.assign(base.settings, parsed.settings||{}) });
  }catch(e){
    return freshState();
  }
}
function saveState(){
  if(!CURRENT_USER) return;
  localStorage.setItem(dataKeyFor(CURRENT_USER.companyId), JSON.stringify(state));
}

/* ---------- Auth (shared login with Acacia Books apps) ---------- */
const USERS_KEY = 'acaciaCrmUsers';
const SESSION_KEY = 'acaciaCrmSession';
let CURRENT_USER = null;

AcaciaCloud.init({app:'Projects', dataKey:dataKeyFor});
function getUsers(){
  try{ return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }catch(e){ return []; }
}
function saveUsers(list){ localStorage.setItem(USERS_KEY, JSON.stringify(list)); }
function getSession(){
  try{ return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }catch(e){ return null; }
}
function setSession(user){ localStorage.setItem(SESSION_KEY, JSON.stringify({email:user.email, companyId:user.companyId, name:user.name, company:user.company})); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }

function switchAuthTab(which){
  document.getElementById('tabLoginBtn').classList.toggle('active', which==='login');
  document.getElementById('tabRegisterBtn').classList.toggle('active', which==='register');
  document.getElementById('loginPane').style.display = which==='login' ? 'block' : 'none';
  document.getElementById('registerPane').style.display = which==='register' ? 'block' : 'none';
  document.getElementById('loginError').classList.remove('show');
  document.getElementById('registerError').classList.remove('show');
}
function showAuthError(id, msg){
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
}
async function handleRegister(){
  const company = document.getElementById('regCompany').value.trim();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  if(!company || !name || !email || !password){ showAuthError('registerError','Please fill in every field.'); return; }
  if(password.length < 6){ showAuthError('registerError','Password must be at least 6 characters.'); return; }
  const users = getUsers();
  let user, viaCloud = false;
  try{
    const c = await AcaciaCloud.register({company, name, email, password, plan:(document.getElementById('regPlan')||{}).value||'', billing:(document.getElementById('regBilling')||{}).value||'monthly'});
    if(c.blocked){ showAuthError('registerError','Account created. ' + c.blocked); return; }
    user = {companyId:c.companyId, company, name, email, role:'Administrator', passwordHash:c.passwordHash, passwordSalt:c.passwordSalt};
    viaCloud = true;
  }catch(e){
    if(e.code === 'exists'){ showAuthError('registerError','This company already has an account with that email. Please sign in instead.'); return; }
    if(e.code !== 'offline'){ showAuthError('registerError', e.message || 'Could not create the account. Please try again.'); return; }
    if(users.some(u=>u.email===email)){ showAuthError('registerError','An account with that email already exists.'); return; }
    user = {companyId:uid('co'), company, name, email, password, role:'Administrator'};   // offline: uploaded the next time you sign in online
  }
  if(viaCloud) AcaciaCloud.cacheUser(USERS_KEY, user); else { users.push(user); saveUsers(users); }
  setSession(user);
  await enterApp(user);
}
async function handleLogin(){
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const company = (document.getElementById('loginCompany').value || '').trim();
  if(!company || !email || !password){ showAuthError('loginError','Please enter your company name, email and password.'); return; }
  let user = null;
  try{
    user = await AcaciaCloud.signIn(email, password, company);
    if(user) AcaciaCloud.cacheUser(USERS_KEY, user);
  }catch(e){
    if(e.code === 'blocked'){ showAuthError('loginError', e.message); return; }
  }
  if(!user){
    const users = getUsers();
    for(const u of users){ if(u.email === email && String(u.company||'').trim().toLowerCase() === company.toLowerCase() && await AcaciaCloud.verifyLocal(u, password)){ user = u; break; } }
    if(!user){ showAuthError('loginError','That email and password combination was not found.'); return; }
    if(!AcaciaCloud.isCloudId(user.companyId)){
      try{ const moved = await AcaciaCloud.migrate(user, password, users); if(moved){ saveUsers(users); user = moved; } }catch(e){ /* offline: stays on this device for now */ }
    }
  }
  setSession(user);
  await enterApp(user);
}
function handleLogout(){
  AcaciaCloud.stop();
  clearSession();
  CURRENT_USER = null;
  state = null;
  document.getElementById('app').classList.remove('ready');
  hpShowHome();
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  switchAuthTab('login');
}
function initials(name){ return (name||'').split(' ').filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join(''); }

async function enterApp(user){
  let res = 'local';
  try{ res = await AcaciaCloud.start(user); }catch(e){}
  if(String(res).indexOf('blocked:') === 0){
    try{ clearSession(); }catch(e){}
    AcaciaCloud.stop();
    alert(String(res).slice(8));
    location.reload();
    return;
  }
  return __enterAppLocal(user);
}
function __enterAppLocal(user){
  if(!user.role) user.role = 'Administrator';
  CURRENT_USER = user;
  state = loadState(user.companyId);
  if(!state.settings.company.name) state.settings.company.name = user.company;
  document.getElementById('authScreen').style.display = 'none'; hpHideHome();
  document.getElementById('app').classList.add('ready');
  document.getElementById('sidebarUser').innerHTML = `<div style="font-weight:700;color:#fff;">${esc(user.name)}</div><div style="font-size:12px;">${esc(user.company)}</div>`;
  renderNav();
  route = {section:'dashboard', params:{}};
  render();
}
function checkSessionOnLoad(){
  const session = getSession();
  if(session){
    const users = getUsers();
    const user = users.find(u=>u.email===session.email && u.companyId===session.companyId);
    if(user){ enterApp(user); return; }
  }
  hpShowHome();
}

/* ---------- Theme (dark mode) ---------- */
const THEME_KEY = 'acacia_theme';
function toggleTheme(){
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if(isDark){
    document.documentElement.removeAttribute('data-theme');
    try{ localStorage.setItem(THEME_KEY, 'light'); }catch(e){}
  }else{
    document.documentElement.setAttribute('data-theme', 'dark');
    try{ localStorage.setItem(THEME_KEY, 'dark'); }catch(e){}
  }
  updateThemeToggleIcon();
}
function updateThemeToggleIcon(){
  const btn = document.getElementById('themeToggle');
  if(!btn) return;
  btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
}

function uid(prefix){ return prefix + '_' + Math.random().toString(36).slice(2,9); }
function esc(str){
  if(str===undefined||str===null) return '';
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtMoney(n){
  n = Number(n)||0;
  return state.settings.company.currency + ' ' + n.toLocaleString('en-KE',{maximumFractionDigits:0});
}
function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d+'T00:00:00');
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function daysDiff(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* =========================================================
   Entity schemas
========================================================= */
function projectOptions(){ return state.projects.map(p=>({value:p.id,label:p.name||'(unnamed project)'})); }
function teamOptions(){ return state.team.map(t=>({value:t.id,label:t.name||'(unnamed)'})); }
function milestoneOptionsFor(projectId){ return state.milestones.filter(m=>m.projectId===projectId).map(m=>({value:m.id,label:m.name})); }

function projectName(id){ const p = state.projects.find(p=>p.id===id); return p? p.name : '—'; }
function memberName(id){ const t = state.team.find(t=>t.id===id); return t? t.name : (id||'—'); }

const ENTITIES = {
  projects: {
    label:'Project', labelPlural:'Projects', icon:'◧',
    fields: [
      {key:'name', label:'Project Name', type:'text', required:true},
      {key:'code', label:'Project Code', type:'text', placeholder:'auto-generated if left blank'},
      {key:'client', label:'Client', type:'text'},
      {key:'manager', label:'Project Manager', type:'select', options:teamOptions},
      {key:'status', label:'Status', type:'select', options:()=>state.settings.projectStatuses},
      {key:'priority', label:'Priority', type:'select', options:()=>state.settings.priorities},
      {key:'startDate', label:'Start Date', type:'date'},
      {key:'endDate', label:'Expected End Date', type:'date'},
      {key:'budget', label:'Budget', type:'number'},
      {key:'actualCost', label:'Actual Cost', type:'number'},
      {key:'labourCost', label:'Labour Cost', type:'number'},
      {key:'materialsCost', label:'Materials Cost', type:'number'},
      {key:'servicesCost', label:'Services Cost', type:'number'},
      {key:'otherCost', label:'Other Cost', type:'number'},
      {key:'progress', label:'Progress %', type:'number', min:0, max:100},
      {key:'description', label:'Description', type:'textarea'},
    ],
    columns:['name','code','client','status','priority','progress'],
    beforeSave:(rec)=>{
      if(!rec.code){
        rec.code = state.settings.projectNumberingPrefix + String(state.settings.nextProjectNumber).padStart(3,'0');
        state.settings.nextProjectNumber++;
      }
      rec.progress = Math.max(0, Math.min(100, Number(rec.progress)||0));
    }
  },
  tasks: {
    label:'Task', labelPlural:'Tasks', icon:'☑',
    fields:[
      {key:'name', label:'Task Name', type:'text', required:true},
      {key:'projectId', label:'Project', type:'select', options:projectOptions},
      {key:'assignee', label:'Assigned Person', type:'select', options:teamOptions},
      {key:'status', label:'Status', type:'select', options:()=>state.settings.taskStatuses},
      {key:'priority', label:'Priority', type:'select', options:()=>state.settings.priorities},
      {key:'startDate', label:'Start Date', type:'date'},
      {key:'dueDate', label:'Due Date', type:'date'},
      {key:'estHours', label:'Estimated Hours', type:'number'},
      {key:'actualHours', label:'Actual Hours', type:'number'},
      {key:'dependencies', label:'Dependencies', type:'text', placeholder:'e.g. task names, comma separated'},
      {key:'checklist', label:'Checklist items (comma separated)', type:'text'},
      {key:'description', label:'Description', type:'textarea'},
    ],
    columns:['name','projectId','assignee','status','priority','dueDate']
  },
  milestones: {
    label:'Milestone', labelPlural:'Milestones', icon:'◎',
    fields:[
      {key:'name', label:'Milestone Name', type:'text', required:true},
      {key:'projectId', label:'Project', type:'select', options:projectOptions},
      {key:'dueDate', label:'Due Date', type:'date'},
      {key:'responsible', label:'Responsible Person', type:'select', options:teamOptions},
      {key:'status', label:'Status', type:'select', options:()=>state.settings.milestoneStatuses},
      {key:'completion', label:'Completion %', type:'number', min:0, max:100},
    ],
    columns:['name','projectId','dueDate','responsible','status','completion']
  },
  team: {
    label:'Team Member', labelPlural:'Team', icon:'☺',
    fields:[
      {key:'name', label:'Name', type:'text', required:true},
      {key:'role', label:'Role', type:'select', options:()=>state.settings.projectRoles},
      {key:'email', label:'Email', type:'text'},
      {key:'phone', label:'Phone', type:'text'},
    ],
    columns:['name','role','email','phone']
  },
  timeEntries: {
    label:'Time Entry', labelPlural:'Time Tracking', icon:'⏱',
    fields:[
      {key:'projectId', label:'Project', type:'select', options:projectOptions},
      {key:'taskId', label:'Task', type:'select', options:()=>state.tasks.map(t=>({value:t.id,label:t.name}))},
      {key:'person', label:'Person', type:'select', options:teamOptions},
      {key:'date', label:'Date', type:'date'},
      {key:'startTime', label:'Start Time', type:'time'},
      {key:'endTime', label:'End Time', type:'time'},
      {key:'description', label:'Description', type:'textarea'},
    ],
    columns:['date','projectId','taskId','person','hours'],
    beforeSave:(rec)=>{
      if(rec.startTime && rec.endTime){
        const [sh,sm]=rec.startTime.split(':').map(Number);
        const [eh,em]=rec.endTime.split(':').map(Number);
        let mins = (eh*60+em)-(sh*60+sm);
        if(mins<0) mins+=24*60;
        rec.hours = +(mins/60).toFixed(2);
      } else { rec.hours = rec.hours || 0; }
    }
  },
  documents: {
    label:'Document', labelPlural:'Documents', icon:'▤',
    fields:[
      {key:'name', label:'Document Name', type:'text', required:true},
      {key:'projectId', label:'Project', type:'select', options:projectOptions},
      {key:'category', label:'Category', type:'select', options:()=>['Proposal','Contract','Plan','Report','Image','Supporting Document']},
      {key:'link', label:'Link / Reference', type:'text', placeholder:'URL or file reference'},
      {key:'uploadedBy', label:'Uploaded By', type:'select', options:teamOptions},
      {key:'date', label:'Date', type:'date'},
    ],
    columns:['name','projectId','category','uploadedBy','date']
  },
  issues: {
    label:'Issue', labelPlural:'Issues', icon:'⚑',
    fields:[
      {key:'title', label:'Issue', type:'text', required:true},
      {key:'projectId', label:'Project', type:'select', options:projectOptions},
      {key:'reportedBy', label:'Reported By', type:'select', options:teamOptions},
      {key:'assignedTo', label:'Assigned To', type:'select', options:teamOptions},
      {key:'priority', label:'Priority', type:'select', options:()=>state.settings.priorities},
      {key:'date', label:'Date Raised', type:'date'},
      {key:'dueDate', label:'Due Date', type:'date'},
      {key:'status', label:'Status', type:'select', options:()=>state.settings.issueStatuses},
      {key:'resolution', label:'Resolution', type:'textarea'},
    ],
    columns:['title','projectId','assignedTo','priority','status','dueDate']
  }
};

/* =========================================================
   Navigation
========================================================= */
const NAV = [
  {key:'dashboard', label:'Dashboard'},
  {key:'projects', label:'Projects'},
  {key:'tasks', label:'Tasks'},
  {key:'milestones', label:'Milestones'},
  {key:'calendar', label:'Calendar'},
  {key:'team', label:'Team'},
  {key:'timeEntries', label:'Time Tracking'},
  {key:'budgets', label:'Budgets'},
  {key:'documents', label:'Documents'},
  {key:'issues', label:'Issues'},
  {key:'reports', label:'Reports'},
  {key:'settings', label:'Settings'},
];

let route = {section:'dashboard', params:{}};

function renderNav(){
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV.map(n=>`
    <div class="nav-item ${route.section===n.key?'active':''}" onclick="goTo('${n.key}')">
      <span class="dot"></span>${n.label}
    </div>`).join('');
}

function goTo(section, params){
  route = {section, params: params||{}};
  renderNav();
  render();
}

/* =========================================================
   Generic modal form handling
========================================================= */
let modalCtx = null; // {entityKey, recordId, presetFields}

function openEntityModal(entityKey, recordId, presetFields){
  const schema = ENTITIES[entityKey];
  const record = recordId ? state[entityKey].find(r=>r.id===recordId) : Object.assign({}, presetFields||{});
  modalCtx = {entityKey, recordId, record: Object.assign({}, record)};

  document.getElementById('modalTitle').textContent = (recordId? 'Edit ':'New ') + schema.label;
  const body = document.getElementById('modalBody');
  body.innerHTML = schema.fields.map(f=>renderField(f, modalCtx.record)).join('');
  document.getElementById('modalSaveBtn').onclick = saveEntityModal;
  document.getElementById('modalOverlay').classList.add('open');
}

function renderField(f, record){
  const val = record[f.key]!==undefined ? record[f.key] : '';
  const id = 'f_'+f.key;
  if(f.type==='select'){
    const opts = typeof f.options==='function'? f.options() : (f.options||[]);
    const normalized = opts.map(o=> typeof o==='string' ? {value:o,label:o} : o);
    return `<div class="field"><label>${esc(f.label)}${f.required?' *':''}</label>
      <select id="${id}" data-key="${f.key}">
        <option value="">— Select —</option>
        ${normalized.map(o=>`<option value="${esc(o.value)}" ${String(val)===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('')}
      </select></div>`;
  }
  if(f.type==='textarea'){
    return `<div class="field"><label>${esc(f.label)}</label><textarea id="${id}" data-key="${f.key}" placeholder="${esc(f.placeholder||'')}">${esc(val)}</textarea></div>`;
  }
  return `<div class="field"><label>${esc(f.label)}${f.required?' *':''}</label>
    <input id="${id}" data-key="${f.key}" type="${f.type}" value="${esc(val)}" placeholder="${esc(f.placeholder||'')}" ${f.min!==undefined?`min="${f.min}"`:''} ${f.max!==undefined?`max="${f.max}"`:''}>
  </div>`;
}

function saveEntityModal(){
  const {entityKey, recordId, record} = modalCtx;
  const schema = ENTITIES[entityKey];
  const body = document.getElementById('modalBody');
  const inputs = body.querySelectorAll('[data-key]');
  const draft = Object.assign({}, record);
  let missingRequired = false;
  inputs.forEach(inp=>{
    draft[inp.dataset.key] = inp.value;
  });
  schema.fields.forEach(f=>{
    if(f.required && !draft[f.key]){ missingRequired = true; }
  });
  if(missingRequired){ toast('Please fill required fields.'); return; }
  if(schema.beforeSave) schema.beforeSave(draft);

  if(recordId){
    const idx = state[entityKey].findIndex(r=>r.id===recordId);
    state[entityKey][idx] = Object.assign(state[entityKey][idx], draft);
  } else {
    draft.id = uid(entityKey);
    draft.createdAt = todayISO();
    state[entityKey].push(draft);
  }
  saveState();
  closeModal();
  toast(schema.label + (recordId? ' updated' : ' created') + '.');
  render();
}

function closeModal(){
  document.getElementById('modalOverlay').classList.remove('open');
  modalCtx = null;
}

function deleteRecord(entityKey, id){
  if(!confirm('Delete this ' + ENTITIES[entityKey].label.toLowerCase() + '? This cannot be undone.')) return;
  state[entityKey] = state[entityKey].filter(r=>r.id!==id);
  saveState();
  toast(ENTITIES[entityKey].label + ' deleted.');
  render();
}

/* =========================================================
   Generic table renderer
========================================================= */
const COLUMN_LABELS = {
  name:'Name', code:'Code', client:'Client', manager:'Manager', status:'Status', priority:'Priority',
  progress:'Progress', projectId:'Project', assignee:'Assignee', dueDate:'Due Date', responsible:'Responsible',
  completion:'Completion', role:'Role', email:'Email', phone:'Phone', date:'Date', taskId:'Task',
  person:'Person', hours:'Hours', category:'Category', uploadedBy:'Uploaded By', title:'Issue',
  reportedBy:'Reported By', assignedTo:'Assigned To'
};

function cellValue(entityKey, col, rec){
  if(col==='projectId') return projectName(rec.projectId);
  if(col==='assignee' || col==='responsible' || col==='person' || col==='uploadedBy' || col==='reportedBy' || col==='assignedTo' || col==='manager') return memberName(rec[col]) === '—' ? (rec[col]||'—') : memberName(rec[col]);
  if(col==='taskId'){ const t = state.tasks.find(t=>t.id===rec.taskId); return t? t.name : '—'; }
  if(col==='status') return `<span class="badge status-${esc((rec.status||'').replace(/ /g,'.'))}">${esc(rec.status||'—')}</span>`;
  if(col==='priority') return `<span class="badge priority-${esc(rec.priority||'')}">${esc(rec.priority||'—')}</span>`;
  if(col==='progress' || col==='completion'){
    const v = Number(rec[col])||0;
    return `<div class="progress-row" style="min-width:120px"><div class="progress-track"><div class="progress-fill" style="width:${v}%"></div></div><span class="pct">${v}%</span></div>`;
  }
  if(col==='dueDate' || col==='date') return fmtDate(rec[col]);
  if(col==='hours') return (rec.hours||0)+' h';
  return esc(rec[col]===undefined? '—' : (rec[col]===''? '—' : rec[col]));
}

function renderEntityTable(entityKey, records, opts){
  opts = opts || {};
  const schema = ENTITIES[entityKey];
  const cols = opts.columns || schema.columns;
  if(!records.length){
    return `<div class="empty-state">
      <div class="title">No ${schema.labelPlural.toLowerCase()} yet</div>
      <div>Create your first ${schema.label.toLowerCase()} to get started.</div>
      <button class="btn primary" onclick="openEntityModal('${entityKey}', null, ${opts.preset? JSON.stringify(opts.preset).replace(/"/g,'&quot;') : 'null'})">+ New ${schema.label}</button>
    </div>`;
  }
  return `<table>
    <thead><tr>${cols.map(c=>`<th>${COLUMN_LABELS[c]||c}</th>`).join('')}<th></th></tr></thead>
    <tbody>
      ${records.map(rec=>`
        <tr onclick="handleRowClick(event,'${entityKey}','${rec.id}')">
          ${cols.map(c=>`<td>${cellValue(entityKey,c,rec)}</td>`).join('')}
          <td class="row-actions">
            <button class="icon-btn" onclick="event.stopPropagation();openEntityModal('${entityKey}','${rec.id}')" title="Edit">✎</button>
            <button class="icon-btn" onclick="event.stopPropagation();deleteRecord('${entityKey}','${rec.id}')" title="Delete">🗑</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}

function handleRowClick(e, entityKey, id){
  if(entityKey==='projects'){ goTo('projectDetail', {id}); }
}

/* =========================================================
   Section renderers
========================================================= */
function setHeader(eyebrow, title, actionsHtml){
  document.getElementById('pageEyebrow').textContent = eyebrow;
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('topActions').innerHTML = actionsHtml || '';
}

function render(){
  const c = document.getElementById('content');
  const sec = route.section;
  if(sec==='dashboard') return renderDashboard(c);
  if(sec==='projects') return renderProjectsList(c);
  if(sec==='projectDetail') return renderProjectDetail(c, route.params.id);
  if(sec==='tasks') return renderSimpleEntity(c,'tasks','Planning','Tasks');
  if(sec==='milestones') return renderMilestonesSection(c);
  if(sec==='calendar') return renderCalendar(c);
  if(sec==='team') return renderSimpleEntity(c,'team','People','Team');
  if(sec==='timeEntries') return renderTimeTracking(c);
  if(sec==='budgets') return renderBudgets(c);
  if(sec==='documents') return renderSimpleEntity(c,'documents','Files','Documents');
  if(sec==='issues') return renderSimpleEntity(c,'issues','Tracking','Issues');
  if(sec==='reports') return renderReports(c);
  if(sec==='settings') return renderSettings(c);
}

/* ---------- Dashboard ---------- */
function renderDashboard(c){
  setHeader('Overview','Dashboard', `<button class="btn primary" onclick="openEntityModal('projects')">+ New Project</button>`);
  const P = state.projects, T = state.tasks;
  const today = todayISO();
  const active = P.filter(p=>p.status==='In Progress'||p.status==='Not Started'||p.status==='Planning').length;
  const completed = P.filter(p=>p.status==='Completed').length;
  const overdue = P.filter(p=>p.endDate && p.endDate<today && p.status!=='Completed' && p.status!=='Cancelled').length;
  const tasksDueToday = T.filter(t=>t.dueDate===today && t.status!=='Completed').length;
  const tasksOverdue = T.filter(t=>t.dueDate && t.dueDate<today && t.status!=='Completed').length;
  const totalBudget = P.reduce((s,p)=>s+(Number(p.budget)||0),0);
  const actualCost = P.reduce((s,p)=>s+(Number(p.actualCost)||0),0);
  const overallProgress = P.length? Math.round(P.reduce((s,p)=>s+(Number(p.progress)||0),0)/P.length) : 0;

  const stats = [
    {n:P.length, l:'Total Projects'},
    {n:active, l:'Active Projects'},
    {n:completed, l:'Completed Projects', cls:'gold'},
    {n:overdue, l:'Overdue Projects', cls:overdue?'danger':''},
    {n:tasksDueToday, l:'Tasks Due Today', cls:tasksDueToday?'warn':''},
    {n:tasksOverdue, l:'Tasks Overdue', cls:tasksOverdue?'danger':''},
    {n:fmtMoney(totalBudget), l:'Total Project Budget'},
    {n:fmtMoney(actualCost), l:'Actual Project Cost'},
    {n:overallProgress+'%', l:'Overall Project Progress', cls:'gold'},
  ];

  const upcoming = T.filter(t=>t.dueDate && t.status!=='Completed').sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,6);
  const recent = [...P].slice(-5).reverse();
  const myTasks = T.slice(-6).reverse();
  const statusCounts = {};
  state.settings.projectStatuses.forEach(s=>statusCounts[s]=0);
  P.forEach(p=>{ if(statusCounts[p.status]!==undefined) statusCounts[p.status]++; });

  c.innerHTML = `
    <div class="stat-grid">
      ${stats.map(s=>`<div class="stat-card ${s.cls||''}"><div class="num">${s.n}</div><div class="lbl">${s.l}</div></div>`).join('')}
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h3>Project Status Summary</h3></div>
        <div class="panel-body">
          ${P.length===0? `<div class="empty-state"><div class="title">No projects yet</div><div>Add a project to see status breakdown here.</div></div>` :
          Object.entries(statusCounts).map(([s,n])=>`
            <div class="progress-row" style="margin-bottom:10px;">
              <div style="width:110px;font-size:13.5px;">${esc(s)}</div>
              <div class="progress-track"><div class="progress-fill" style="width:${P.length? (n/P.length*100):0}%"></div></div>
              <span class="pct">${n}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Upcoming Deadlines</h3></div>
        <div class="panel-body">
          ${upcoming.length===0? `<div class="empty-state" style="padding:20px;"><div>No upcoming task deadlines.</div></div>` :
            upcoming.map(t=>`<div class="kv" style="grid-template-columns:1fr auto;margin-bottom:8px;">
              <div>${esc(t.name)} <span class="muted">— ${esc(projectName(t.projectId))}</span></div>
              <div class="muted">${fmtDate(t.dueDate)}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h3>Recent Activity</h3></div>
        <div class="panel-body">
          ${recent.length===0? `<div class="empty-state" style="padding:20px;"><div>No activity recorded yet.</div></div>` :
          recent.map(p=>`<div class="kv" style="grid-template-columns:1fr auto;margin-bottom:8px;">
              <div>Project <b>${esc(p.name)}</b> ${p.recordId? '' : 'created'}</div>
              <div class="muted">${fmtDate(p.createdAt)}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>My Tasks</h3></div>
        <div class="panel-body">
          ${myTasks.length===0? `<div class="empty-state" style="padding:20px;"><div>No tasks yet.</div></div>` :
          myTasks.map(t=>`<div class="kv" style="grid-template-columns:1fr auto;margin-bottom:8px;">
              <div>${esc(t.name)} <span class="muted">— ${esc(memberName(t.assignee))}</span></div>
              <div><span class="badge status-${esc((t.status||'').replace(/ /g,'.'))}">${esc(t.status||'—')}</span></div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Project Progress</h3></div>
      <div class="panel-body">
        ${P.length===0? `<div class="empty-state"><div class="title">No projects to chart</div><div>Progress bars will appear here once projects are created.</div></div>` :
          P.map(p=>`<div style="margin-bottom:12px;">
            <div class="progress-row"><div style="width:200px;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.name)}</div>
            <div class="progress-track"><div class="progress-fill" style="width:${p.progress||0}%"></div></div>
            <span class="pct">${p.progress||0}%</span></div>
          </div>`).join('')}
      </div>
    </div>
  `;
}

/* ---------- Projects list ---------- */
function renderProjectsList(c){
  setHeader('Portfolio','Projects', `<button class="btn primary" onclick="openEntityModal('projects')">+ New Project</button>`);
  const P = state.projects;
  const groups = [
    {label:'All Projects', filter:p=>true},
    {label:'Active', filter:p=>['Planning','Not Started','In Progress'].includes(p.status)},
    {label:'Completed', filter:p=>p.status==='Completed'},
    {label:'Archived', filter:p=>p.status==='Cancelled'},
  ];
  const activeGroup = route.params.group || 'All Projects';
  const group = groups.find(g=>g.label===activeGroup) || groups[0];
  const filtered = P.filter(group.filter);

  c.innerHTML = `
    <div class="tabs">
      ${groups.map(g=>`<div class="tab ${g.label===activeGroup?'active':''}" onclick="goTo('projects',{group:'${g.label}'})">${g.label}</div>`).join('')}
    </div>
    <div class="panel"><div class="panel-body">
      ${renderEntityTable('projects', filtered)}
    </div></div>
  `;
}

/* ---------- Project detail ---------- */
function renderProjectDetail(c, id){
  const p = state.projects.find(p=>p.id===id);
  if(!p){ setHeader('Projects','Not found',''); c.innerHTML = `<div class="empty-state"><div class="title">Project not found</div><button class="btn" onclick="goTo('projects')">Back to Projects</button></div>`; return; }

  setHeader('Project', p.name, `<button class="btn" onclick="goTo('projects')">← All Projects</button> <button class="btn primary" onclick="openEntityModal('projects','${p.id}')">Edit Project</button>`);

  const tab = route.params.tab || 'Overview';
  const tabs = ['Overview','Tasks','Timeline','Budget','Team','Files','Issues','Activity'];
  const projTasks = state.tasks.filter(t=>t.projectId===p.id);
  const projIssues = state.issues.filter(i=>i.projectId===p.id);
  const projDocs = state.documents.filter(d=>d.projectId===p.id);
  const projMilestones = state.milestones.filter(m=>m.projectId===p.id);
  const projTime = state.timeEntries.filter(t=>t.projectId===p.id);
  const completedTasks = projTasks.filter(t=>t.status==='Completed').length;

  let body = '';
  if(tab==='Overview'){
    body = `
      <div class="progress-row" style="margin-bottom:20px;">
        <div class="progress-track" style="height:12px;"><div class="progress-fill" style="width:${p.progress||0}%"></div></div>
        <span class="pct">${p.progress||0}%</span>
      </div>
      <div class="two-col">
        <div class="panel"><div class="panel-head"><h3>Details</h3></div><div class="panel-body kv">
          <div>Client</div><div>${esc(p.client||'—')}</div>
          <div>Project Manager</div><div>${esc(memberName(p.manager))}</div>
          <div>Status</div><div><span class="badge status-${esc((p.status||'').replace(/ /g,'.'))}">${esc(p.status||'—')}</span></div>
          <div>Priority</div><div><span class="badge priority-${esc(p.priority||'')}">${esc(p.priority||'—')}</span></div>
          <div>Start Date</div><div>${fmtDate(p.startDate)}</div>
          <div>End Date</div><div>${fmtDate(p.endDate)}</div>
          <div>Budget</div><div>${fmtMoney(p.budget)}</div>
          <div>Actual Cost</div><div>${fmtMoney(p.actualCost)}</div>
          <div>Tasks</div><div>${projTasks.length}</div>
          <div>Completed</div><div>${completedTasks}</div>
        </div></div>
        <div class="panel"><div class="panel-head"><h3>Description</h3></div><div class="panel-body">
          ${p.description? `<div>${esc(p.description)}</div>` : `<div class="muted">No description added.</div>`}
        </div></div>
      </div>
    `;
  } else if(tab==='Tasks'){
    body = `<div class="panel"><div class="panel-head"><h3>Tasks</h3><button class="btn small primary" onclick="openEntityModal('tasks',null,{projectId:'${p.id}'})">+ New Task</button></div>
      <div class="panel-body">${renderEntityTable('tasks', projTasks, {columns:['name','assignee','status','priority','dueDate'], preset:{projectId:p.id}})}</div></div>`;
  } else if(tab==='Timeline'){
    body = renderGanttPanel(projTasks, projMilestones, p);
  } else if(tab==='Budget'){
    body = renderProjectBudgetPanel(p);
  } else if(tab==='Team'){
    const memberIds = new Set(projTasks.map(t=>t.assignee).filter(Boolean));
    if(p.manager) memberIds.add(p.manager);
    const members = state.team.filter(t=>memberIds.has(t.id));
    body = `<div class="panel"><div class="panel-head"><h3>Team on this Project</h3></div><div class="panel-body">
      ${members.length===0? `<div class="empty-state"><div>No team members linked yet — assign tasks or a project manager.</div></div>` :
        `<table><thead><tr><th>Name</th><th>Role</th><th>Assigned Tasks</th><th>Task Completion</th></tr></thead><tbody>
          ${members.map(m=>{
            const mt = projTasks.filter(t=>t.assignee===m.id);
            const done = mt.filter(t=>t.status==='Completed').length;
            const pct = mt.length? Math.round(done/mt.length*100) : 0;
            return `<tr><td>${esc(m.name)}</td><td>${esc(m.role||'—')}</td><td>${mt.length}</td><td>
              <div class="progress-row"><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><span class="pct">${pct}%</span></div>
            </td></tr>`;
          }).join('')}
        </tbody></table>`}
    </div></div>`;
  } else if(tab==='Files'){
    body = `<div class="panel"><div class="panel-head"><h3>Documents</h3><button class="btn small primary" onclick="openEntityModal('documents',null,{projectId:'${p.id}'})">+ New Document</button></div>
      <div class="panel-body">${renderEntityTable('documents', projDocs, {columns:['name','category','uploadedBy','date'], preset:{projectId:p.id}})}</div></div>`;
  } else if(tab==='Issues'){
    body = `<div class="panel"><div class="panel-head"><h3>Issues</h3><button class="btn small primary" onclick="openEntityModal('issues',null,{projectId:'${p.id}'})">+ New Issue</button></div>
      <div class="panel-body">${renderEntityTable('issues', projIssues, {columns:['title','assignedTo','priority','status','dueDate'], preset:{projectId:p.id}})}</div></div>`;
  } else if(tab==='Activity'){
    const events = [];
    projTasks.forEach(t=>events.push({date:t.createdAt, text:`Task "${t.name}" added (${t.status})`}));
    projIssues.forEach(i=>events.push({date:i.createdAt, text:`Issue "${i.title}" logged (${i.status})`}));
    projDocs.forEach(d=>events.push({date:d.createdAt, text:`Document "${d.name}" attached`}));
    projTime.forEach(te=>events.push({date:te.createdAt, text:`${te.hours||0}h logged by ${memberName(te.person)}`}));
    events.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    body = `<div class="panel"><div class="panel-head"><h3>Activity</h3></div><div class="panel-body">
      ${events.length===0? `<div class="empty-state"><div>No activity recorded on this project yet.</div></div>` :
      events.map(e=>`<div class="kv" style="grid-template-columns:110px 1fr;margin-bottom:8px;"><div class="muted">${fmtDate(e.date)}</div><div>${esc(e.text)}</div></div>`).join('')}
    </div></div>`;
  }

  c.innerHTML = `
    <div class="tabs">${tabs.map(t=>`<div class="tab ${t===tab?'active':''}" onclick="goTo('projectDetail',{id:'${p.id}',tab:'${t}'})">${t}</div>`).join('')}</div>
    ${body}
  `;
}

/* ---------- Generic simple entity section (tasks/team/documents/issues) ---------- */
function renderSimpleEntity(c, entityKey, eyebrow, title){
  const schema = ENTITIES[entityKey];
  setHeader(eyebrow, title, `<button class="btn primary" onclick="openEntityModal('${entityKey}')">+ New ${schema.label}</button>`);

  let filterHtml = '';
  let records = state[entityKey];
  const projFilter = route.params.projectId;
  const statusFilter = route.params.status;

  if(entityKey==='tasks' || entityKey==='issues'){
    const statusList = entityKey==='tasks'? state.settings.taskStatuses : state.settings.issueStatuses;
    filterHtml = `
      <div class="tabs">
        <div class="tab ${!statusFilter?'active':''}" onclick="goTo('${entityKey}',{})">All</div>
        ${statusList.map(s=>`<div class="tab ${statusFilter===s?'active':''}" onclick="goTo('${entityKey}',{status:'${s}'})">${esc(s)}</div>`).join('')}
      </div>`;
    if(statusFilter) records = records.filter(r=>r.status===statusFilter);
  }
  if(projFilter) records = records.filter(r=>r.projectId===projFilter);

  c.innerHTML = `
    ${filterHtml}
    <div class="panel"><div class="panel-body">${renderEntityTable(entityKey, records)}</div></div>
  `;
}

/* ---------- Milestones ---------- */
function renderMilestonesSection(c){
  setHeader('Stages','Milestones', `<button class="btn primary" onclick="openEntityModal('milestones')">+ New Milestone</button>`);
  const byProject = {};
  state.milestones.forEach(m=>{
    byProject[m.projectId] = byProject[m.projectId] || [];
    byProject[m.projectId].push(m);
  });
  const projectIds = Object.keys(byProject);

  if(state.milestones.length===0){
    document.getElementById('content').innerHTML = renderEntityTable('milestones', []);
    return;
  }

  c.innerHTML = projectIds.map(pid=>{
    const ms = byProject[pid].sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''));
    return `<div class="panel">
      <div class="panel-head"><h3>${esc(projectName(pid))}</h3></div>
      <div class="panel-body">
        <div class="pill-list" style="margin-bottom:16px;">
          ${ms.map(m=>{
            const symbol = m.status==='Completed'? '✓' : (m.status==='In Progress'? '●' : '○');
            return `<span class="pill" title="${esc(m.status)}">${symbol} ${esc(m.name)}</span>`;
          }).join('')}
        </div>
        ${renderEntityTable('milestones', ms, {columns:['name','dueDate','responsible','status','completion']})}
      </div>
    </div>`;
  }).join('');
}

/* ---------- Calendar ---------- */
let calCursor = new Date();
function renderCalendar(c){
  setHeader('Schedule','Calendar', `
    <button class="btn" onclick="calCursor.setMonth(calCursor.getMonth()-1);render()">‹ Prev</button>
    <button class="btn" onclick="calCursor.setMonth(calCursor.getMonth()+1);render()">Next ›</button>
  `);
  const year = calCursor.getFullYear(), month = calCursor.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const items = [];
  state.tasks.forEach(t=>{ if(t.dueDate) items.push({date:t.dueDate, label:t.name, type:'task'}); });
  state.milestones.forEach(m=>{ if(m.dueDate) items.push({date:m.dueDate, label:m.name, type:'milestone'}); });

  let cells = '';
  for(let i=0;i<startDay;i++){
    const d = daysInPrevMonth-startDay+i+1;
    cells += `<div class="cal-cell other"><div class="d">${d}</div></div>`;
  }
  for(let d=1; d<=daysInMonth; d++){
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayItems = items.filter(it=>it.date===iso);
    cells += `<div class="cal-cell"><div class="d">${d}</div>${dayItems.map(it=>`<div class="cal-item ${it.type==='milestone'?'milestone':''}">${esc(it.label)}</div>`).join('')}</div>`;
  }
  const totalCells = startDay+daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for(let i=1;i<=trailing;i++){
    cells += `<div class="cal-cell other"><div class="d">${i}</div></div>`;
  }

  document.getElementById('pageTitle').textContent = calCursor.toLocaleDateString('en-GB',{month:'long', year:'numeric'});

  c.innerHTML = `
    <div class="cal-head-row">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div>${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
  `;
}

/* ---------- Time tracking ---------- */
function renderTimeTracking(c){
  setHeader('Timesheets','Time Tracking', `<button class="btn primary" onclick="openEntityModal('timeEntries')">+ New Entry</button>`);
  const entries = [...state.timeEntries].sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  const byTask = {};
  state.timeEntries.forEach(e=>{
    if(!e.taskId) return;
    byTask[e.taskId] = (byTask[e.taskId]||0) + (Number(e.hours)||0);
  });

  const comparisonRows = state.tasks.filter(t=>t.estHours || byTask[t.id]).map(t=>{
    const actual = byTask[t.id] || Number(t.actualHours) || 0;
    const est = Number(t.estHours)||0;
    const diff = actual-est;
    return `<tr><td>${esc(t.name)}</td><td>${esc(projectName(t.projectId))}</td><td>${est} h</td><td>${actual.toFixed(1)} h</td>
      <td style="color:${diff>0?'var(--danger)':'var(--success)'}">${diff>0?'+':''}${diff.toFixed(1)} h</td></tr>`;
  }).join('');

  c.innerHTML = `
    <div class="panel"><div class="panel-head"><h3>Logged Time</h3></div>
      <div class="panel-body">${renderEntityTable('timeEntries', entries)}</div></div>
    <div class="panel"><div class="panel-head"><h3>Estimated vs Actual Hours</h3></div>
      <div class="panel-body">
        ${comparisonRows? `<table><thead><tr><th>Task</th><th>Project</th><th>Estimated</th><th>Actual</th><th>Variance</th></tr></thead><tbody>${comparisonRows}</tbody></table>`
        : `<div class="empty-state"><div>No estimated or logged hours yet.</div></div>`}
      </div></div>
  `;
}

/* ---------- Budgets ---------- */
function renderBudgetsBase(c){
  setHeader('Finance','Budgets', `<button class="btn primary" onclick="openEntityModal('projects')">+ New Project</button>`);
  const P = state.projects;
  if(P.length===0){
    c.innerHTML = `<div class="empty-state"><div class="title">No project budgets yet</div><div>Add a project with a budget to track it here.</div></div>`;
    return;
  }
  const totalBudget = P.reduce((s,p)=>s+(Number(p.budget)||0),0);
  const totalActual = P.reduce((s,p)=>s+(Number(p.actualCost)||0),0);

  c.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${fmtMoney(totalBudget)}</div><div class="lbl">Total Budget (all projects)</div></div>
      <div class="stat-card ${totalActual>totalBudget?'danger':''}"><div class="num">${fmtMoney(totalActual)}</div><div class="lbl">Total Actual Cost</div></div>
      <div class="stat-card gold"><div class="num">${fmtMoney(totalBudget-totalActual)}</div><div class="lbl">Remaining</div></div>
    </div>
    ${P.map(p=>projectBudgetCard(p)).join('')}
  `;
}
function projectBudgetCard(p){
  const budget = Number(p.budget)||0, actual = Number(p.actualCost)||0;
  const remaining = budget-actual;
  return `<div class="panel">
    <div class="panel-head"><h3>${esc(p.name)}</h3><button class="btn small" onclick="goTo('projectDetail',{id:'${p.id}',tab:'Budget'})">View Detail</button></div>
    <div class="panel-body kv">
      <div>Budget</div><div>${fmtMoney(budget)}</div>
      <div>Actual Cost</div><div>${fmtMoney(actual)}</div>
      <div>Remaining</div><div style="color:${remaining<0?'var(--danger)':'var(--success)'}">${fmtMoney(remaining)}</div>
    </div>
  </div>`;
}
function renderProjectBudgetPanel(p){
  const budget = Number(p.budget)||0, actual = Number(p.actualCost)||0, remaining = budget-actual;
  const labour = Number(p.labourCost)||0, materials = Number(p.materialsCost)||0, services = Number(p.servicesCost)||0, other = Number(p.otherCost)||0;
  const breakdownTotal = labour+materials+services+other || 1;
  const rows = [['Labour',labour],['Materials',materials],['Services',services],['Other',other]];
  return `<div class="two-col">
    <div class="panel"><div class="panel-head"><h3>Project Budget</h3></div>
      <div class="panel-body kv">
        <div>Original Budget</div><div>${fmtMoney(budget)}</div>
        <div>Actual Cost</div><div>${fmtMoney(actual)}</div>
        <div>Remaining Budget</div><div style="color:${remaining<0?'var(--danger)':'var(--success)'}">${fmtMoney(remaining)}</div>
      </div>
    </div>
    <div class="panel"><div class="panel-head"><h3>Cost Breakdown</h3></div>
      <div class="panel-body">
        ${rows.map(([label,val])=>`<div class="progress-row" style="margin-bottom:10px;">
          <div style="width:90px;font-size:13.5px;">${label}</div>
          <div class="progress-track"><div class="progress-fill" style="width:${val/breakdownTotal*100}%"></div></div>
          <span class="pct">${fmtMoney(val)}</span>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

/* ---------- Gantt ---------- */
function renderGanttPanel(tasks, milestones, project){
  const items = [];
  tasks.forEach(t=>{ if(t.startDate && t.dueDate) items.push({label:t.name, start:t.startDate, end:t.dueDate, type:'task'}); });
  milestones.forEach(m=>{ if(m.dueDate) items.push({label:m.name, start:m.dueDate, end:m.dueDate, type:'milestone'}); });
  if(project && project.startDate && project.endDate && items.length===0){
    items.push({label:project.name, start:project.startDate, end:project.endDate, type:'task'});
  }
  if(items.length===0){
    return `<div class="panel"><div class="panel-body"><div class="empty-state"><div class="title">No timeline data yet</div><div>Add tasks or milestones with dates to see the timeline.</div></div></div></div>`;
  }
  const allDates = items.flatMap(i=>[new Date(i.start), new Date(i.end)]);
  let minDate = new Date(Math.min(...allDates));
  let maxDate = new Date(Math.max(...allDates));
  minDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth()+1, 0);
  const totalDays = Math.max(1, daysDiff(minDate, maxDate));

  const monthCount = (maxDate.getFullYear()-minDate.getFullYear())*12 + (maxDate.getMonth()-minDate.getMonth()) + 1;
  const months = [];
  for(let i=0;i<monthCount;i++){
    const md = new Date(minDate.getFullYear(), minDate.getMonth()+i, 1);
    months.push(md.toLocaleDateString('en-GB',{month:'short'}));
  }

  const rows = items.map(it=>{
    const startOffset = daysDiff(minDate, it.start)/totalDays*100;
    const width = it.type==='milestone'? 1.6 : Math.max(1.6, daysDiff(it.start, it.end)/totalDays*100);
    return `<div class="gantt-row">
      <div class="gantt-label" title="${esc(it.label)}">${esc(it.label)}</div>
      <div class="gantt-track"><div class="gantt-bar ${it.type==='milestone'?'milestone':''}" style="left:${startOffset}%;width:${width}%" title="${esc(it.label)}: ${fmtDate(it.start)} – ${fmtDate(it.end)}"></div></div>
    </div>`;
  }).join('');

  return `<div class="panel"><div class="panel-head"><h3>Timeline</h3></div>
    <div class="panel-body">
      <div class="gantt-wrap">
        <div class="gantt-grid">
          <div class="gantt-header">${months.map(m=>`<div class="gantt-month">${m}</div>`).join('')}</div>
          ${rows}
        </div>
      </div>
    </div>
  </div>`;
}

/* ---------- Reports ---------- */
const REPORT_DEFS = [
  {key:'summary', label:'Project Summary'},
  {key:'progress', label:'Project Progress'},
  {key:'profitability', label:'Project Profitability'},
  {key:'budgetVsActual', label:'Budget vs Actual'},
  {key:'taskReport', label:'Task Report'},
  {key:'overdueTasks', label:'Overdue Tasks'},
  {key:'teamWorkload', label:'Team Workload'},
  {key:'timeTracking', label:'Time Tracking Report'},
  {key:'milestoneReport', label:'Milestone Report'},
  {key:'costReport', label:'Project Cost Report'},
  {key:'performance', label:'Project Performance'},
  {key:'issuesReport', label:'Issues Report'},
  {key:'completedProjects', label:'Completed Projects'},
  {key:'delayedProjects', label:'Delayed Projects'},
];

function renderReports(c){
  setHeader('Insights','Project Reports','');
  const active = route.params.report || 'summary';
  c.innerHTML = `
    <div class="two-col" style="grid-template-columns:220px 1fr;">
      <div class="panel"><div class="panel-body" style="padding:8px;">
        ${REPORT_DEFS.map(r=>`<div class="nav-item" style="color:var(--ink);${active===r.key?'background:var(--primary-soft);border-left:3px solid var(--gold);':''}" onclick="goTo('reports',{report:'${r.key}'})">${r.label}</div>`).join('')}
      </div></div>
      <div class="panel"><div class="panel-head"><h3>${REPORT_DEFS.find(r=>r.key===active).label}</h3></div>
        <div class="panel-body">${buildReport(active)}</div></div>
    </div>
  `;
}

function buildReport(key){
  const P = state.projects, T = state.tasks, I = state.issues, M = state.milestones;
  const today = todayISO();
  const emptyMsg = (what)=>`<div class="empty-state"><div>No ${what} to report on yet.</div></div>`;

  if(key==='summary'){
    if(!P.length) return emptyMsg('projects');
    return `<table><thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Progress</th><th>Budget</th><th>Actual</th></tr></thead><tbody>
      ${P.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.client||'—')}</td><td>${esc(p.status||'—')}</td><td>${p.progress||0}%</td><td>${fmtMoney(p.budget)}</td><td>${fmtMoney(p.actualCost)}</td></tr>`).join('')}
    </tbody></table>`;
  }
  if(key==='progress'){
    if(!P.length) return emptyMsg('projects');
    return P.map(p=>`<div style="margin-bottom:12px;"><div class="progress-row"><div style="width:200px;">${esc(p.name)}</div><div class="progress-track"><div class="progress-fill" style="width:${p.progress||0}%"></div></div><span class="pct">${p.progress||0}%</span></div></div>`).join('');
  }
  if(key==='profitability'){
    if(!P.length) return emptyMsg('projects');
    return `<table><thead><tr><th>Project</th><th>Budget</th><th>Actual Cost</th><th>Margin</th></tr></thead><tbody>
      ${P.map(p=>{const b=Number(p.budget)||0,a=Number(p.actualCost)||0,m=b-a;return `<tr><td>${esc(p.name)}</td><td>${fmtMoney(b)}</td><td>${fmtMoney(a)}</td><td style="color:${m<0?'var(--danger)':'var(--success)'}">${fmtMoney(m)}</td></tr>`;}).join('')}
    </tbody></table>`;
  }
  if(key==='budgetVsActual'){
    if(!P.length) return emptyMsg('projects');
    return `<table><thead><tr><th>Project</th><th>Budget</th><th>Actual</th><th>Variance %</th></tr></thead><tbody>
      ${P.map(p=>{const b=Number(p.budget)||0,a=Number(p.actualCost)||0;const v=b? ((a-b)/b*100):0;return `<tr><td>${esc(p.name)}</td><td>${fmtMoney(b)}</td><td>${fmtMoney(a)}</td><td style="color:${v>0?'var(--danger)':'var(--success)'}">${v.toFixed(1)}%</td></tr>`;}).join('')}
    </tbody></table>`;
  }
  if(key==='taskReport'){
    if(!T.length) return emptyMsg('tasks');
    return renderEntityTable('tasks', T);
  }
  if(key==='overdueTasks'){
    const rows = T.filter(t=>t.dueDate && t.dueDate<today && t.status!=='Completed');
    if(!rows.length) return emptyMsg('overdue tasks');
    return renderEntityTable('tasks', rows);
  }
  if(key==='teamWorkload'){
    if(!state.team.length) return emptyMsg('team members');
    return `<table><thead><tr><th>Name</th><th>Assigned Tasks</th><th>Completed</th><th>Total Hours Logged</th></tr></thead><tbody>
      ${state.team.map(m=>{
        const mt = T.filter(t=>t.assignee===m.id);
        const done = mt.filter(t=>t.status==='Completed').length;
        const hrs = state.timeEntries.filter(e=>e.person===m.id).reduce((s,e)=>s+(Number(e.hours)||0),0);
        return `<tr><td>${esc(m.name)}</td><td>${mt.length}</td><td>${done}</td><td>${hrs.toFixed(1)} h</td></tr>`;
      }).join('')}
    </tbody></table>`;
  }
  if(key==='timeTracking'){
    if(!state.timeEntries.length) return emptyMsg('time entries');
    return renderEntityTable('timeEntries', state.timeEntries);
  }
  if(key==='milestoneReport'){
    if(!M.length) return emptyMsg('milestones');
    return renderEntityTable('milestones', M);
  }
  if(key==='costReport'){
    if(!P.length) return emptyMsg('projects');
    return `<table><thead><tr><th>Project</th><th>Labour</th><th>Materials</th><th>Services</th><th>Other</th><th>Total</th></tr></thead><tbody>
      ${P.map(p=>{
        const l=Number(p.labourCost)||0,m=Number(p.materialsCost)||0,s=Number(p.servicesCost)||0,o=Number(p.otherCost)||0;
        return `<tr><td>${esc(p.name)}</td><td>${fmtMoney(l)}</td><td>${fmtMoney(m)}</td><td>${fmtMoney(s)}</td><td>${fmtMoney(o)}</td><td>${fmtMoney(l+m+s+o)}</td></tr>`;
      }).join('')}
    </tbody></table>`;
  }
  if(key==='performance'){
    if(!P.length) return emptyMsg('projects');
    return `<table><thead><tr><th>Project</th><th>Progress</th><th>On Time?</th><th>Budget Health</th></tr></thead><tbody>
      ${P.map(p=>{
        const onTime = !(p.endDate && p.endDate<today && p.status!=='Completed');
        const healthy = (Number(p.actualCost)||0) <= (Number(p.budget)||0);
        return `<tr><td>${esc(p.name)}</td><td>${p.progress||0}%</td><td style="color:${onTime?'var(--success)':'var(--danger)'}">${onTime?'On Time':'Behind'}</td><td style="color:${healthy?'var(--success)':'var(--danger)'}">${healthy?'Within Budget':'Over Budget'}</td></tr>`;
      }).join('')}
    </tbody></table>`;
  }
  if(key==='issuesReport'){
    if(!I.length) return emptyMsg('issues');
    return renderEntityTable('issues', I);
  }
  if(key==='completedProjects'){
    const rows = P.filter(p=>p.status==='Completed');
    if(!rows.length) return emptyMsg('completed projects');
    return renderEntityTable('projects', rows);
  }
  if(key==='delayedProjects'){
    const rows = P.filter(p=>p.endDate && p.endDate<today && p.status!=='Completed' && p.status!=='Cancelled');
    if(!rows.length) return emptyMsg('delayed projects');
    return renderEntityTable('projects', rows);
  }
  return '';
}

/* ---------- Settings ---------- */
function renderSettings(c){
  setHeader('Configuration','Settings','');
  const s = state.settings;
  const listBlock = (title, key)=>`
    <div class="settings-block">
      <h4>${title}</h4>
      <div class="pill-list" id="list_${key}">
        ${s[key].map((item,idx)=>`<span class="pill">${esc(item)}<button onclick="removeSettingItem('${key}',${idx})">✕</button></span>`).join('')}
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;">
        <input id="input_${key}" placeholder="Add new..." style="padding:7px 10px;border:1px solid var(--line);border-radius:3px;font-family:Cambria,serif;">
        <button class="btn small" onclick="addSettingItem('${key}')">+ Add</button>
      </div>
    </div>`;

  c.innerHTML = `
    <div class="panel"><div class="panel-head"><h3>Company Information</h3></div>
      <div class="panel-body">
        <div class="field-row">
          <div class="field"><label>Company Name</label><input id="c_name" value="${esc(s.company.name)}"></div>
          <div class="field"><label>Currency</label><input id="c_currency" value="${esc(s.company.currency)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Phone</label><input id="c_phone" value="${esc(s.company.phone)}"></div>
          <div class="field"><label>Email</label><input id="c_email" value="${esc(s.company.email)}"></div>
        </div>
        <div class="field"><label>Address</label><input id="c_address" value="${esc(s.company.address)}"></div>
        <button class="btn primary" onclick="saveCompanyInfo()">Save Company Info</button>
      </div>
    </div>

    <div class="panel"><div class="panel-head"><h3>Project Numbering</h3></div>
      <div class="panel-body field-row">
        <div class="field"><label>Prefix</label><input id="numPrefix" value="${esc(s.projectNumberingPrefix)}"></div>
        <div class="field"><label>Next Number</label><input id="numNext" type="number" value="${s.nextProjectNumber}"></div>
        <div></div>
        <button class="btn primary" style="height:38px;align-self:end;" onclick="saveNumbering()">Save</button>
      </div>
    </div>

    <div class="panel"><div class="panel-head"><h3>Statuses, Priorities &amp; Roles</h3></div>
      <div class="panel-body">
        ${listBlock('Project Statuses','projectStatuses')}
        ${listBlock('Task Statuses','taskStatuses')}
        ${listBlock('Milestone Statuses','milestoneStatuses')}
        ${listBlock('Issue Statuses','issueStatuses')}
        ${listBlock('Priorities','priorities')}
        ${listBlock('Project Roles','projectRoles')}
      </div>
    </div>

    <div class="panel"><div class="panel-head"><h3>Work Hours</h3></div>
      <div class="panel-body field-row">
        <div class="field"><label>Standard Work Hours per Day</label><input id="workHours" type="number" value="${s.workHoursPerDay}"></div>
        <div></div><div></div>
        <button class="btn primary" style="height:38px;align-self:end;" onclick="saveWorkHours()">Save</button>
      </div>
    </div>

    <div class="panel"><div class="panel-head"><h3>Import / Export</h3></div>
      <div class="panel-body">
        <p class="muted" style="margin-top:0;">Export all project data as a JSON backup, or import a previously exported file.</p>
        <div style="display:flex;gap:10px;">
          <button class="btn" onclick="exportData()">Export Data</button>
          <button class="btn" onclick="document.getElementById('importFile').click()">Import Data</button>
          <input type="file" id="importFile" accept="application/json" style="display:none" onchange="importData(event)">
          <button class="btn danger" onclick="resetAllData()">Reset All Data</button>
        </div>
      </div>
    </div>
  `;
}
function saveCompanyInfo(){
  state.settings.company = {
    name: document.getElementById('c_name').value,
    currency: document.getElementById('c_currency').value || 'KES',
    phone: document.getElementById('c_phone').value,
    email: document.getElementById('c_email').value,
    address: document.getElementById('c_address').value,
  };
  saveState(); toast('Company information saved.'); render();
}
function saveNumbering(){
  state.settings.projectNumberingPrefix = document.getElementById('numPrefix').value || 'PRJ-';
  state.settings.nextProjectNumber = Number(document.getElementById('numNext').value) || 1;
  saveState(); toast('Numbering settings saved.');
}
function saveWorkHours(){
  state.settings.workHoursPerDay = Number(document.getElementById('workHours').value) || 8;
  saveState(); toast('Work hours saved.');
}
function addSettingItem(key){
  const input = document.getElementById('input_'+key);
  const val = input.value.trim();
  if(!val) return;
  state.settings[key].push(val);
  saveState(); render();
}
function removeSettingItem(key, idx){
  state.settings[key].splice(idx,1);
  saveState(); render();
}
function exportData(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'acacia-projects-backup-'+todayISO()+'.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported.');
}
function importData(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = evt=>{
    try{
      const parsed = JSON.parse(evt.target.result);
      state = Object.assign(freshState(), parsed, {settings: Object.assign(freshState().settings, parsed.settings||{})});
      saveState();
      toast('Data imported.');
      render();
    }catch(err){ toast('Could not read that file.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}
function resetAllData(){
  if(!confirm('This will permanently erase all Acacia Projects data on this device. Continue?')) return;
  state = freshState();
  saveState();
  toast('All data cleared.');
  goTo('dashboard');
}

/* =========================================================
   Init
========================================================= */
document.getElementById('modalOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='modalOverlay') closeModal();
});
updateThemeToggleIcon();
checkSessionOnLoad();


/* ===== Budget module matching Books: Plan Budget Allocation, Record Expenditure, Budget vs Actual Ledger ===== */
const BD_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const BD_ACCOUNTS=['Salaries & Wages','Materials','Subcontractors','Equipment','Travel','Marketing','Utilities','Professional Fees','Other'];
let bdSearch='';
function bdEnsure(){ state.budgetLines=state.budgetLines||[]; state.budgetActuals=state.budgetActuals||[]; }
function bdTimeframeOpts(period){
  if(period==='Monthly') return BD_MONTHS.map((m,i)=>`<option value="${m}">${m}</option>`).join('');
  if(period==='Quarterly') return ['Q1','Q2','Q3','Q4'].map(q=>`<option>${q}</option>`).join('');
  return '<option value="Full year">Full year</option>';
}
function bdPeriodChange(){ document.getElementById('bdTime').innerHTML=bdTimeframeOpts(document.getElementById('bdPeriod').value); }
function bdLineLabel(l){ return `${l.account} · ${l.department||'General'} · ${l.timeframe} ${l.year}`; }
function renderBudgets(c){
  bdEnsure();
  const tmp=document.createElement('div'); renderBudgetsBase(tmp);
  const q=bdSearch.toLowerCase();
  const rows=state.budgetLines.map(l=>{
    const actual=state.budgetActuals.filter(a=>a.lineId===l.id).reduce((t,a)=>t+Number(a.amount||0),0), budget=Number(l.amount)||0;
    const used=budget?actual/budget*100:0; return {...l,actual,budget,variance:budget-actual,used,status:used>100?'Over budget':used>=80?'Near limit':'On track'};
  }).filter(r=>!q||[r.account,r.department,r.period,r.timeframe,r.year,projectName(r.projectId)].join(' ').toLowerCase().includes(q));
  const tb=rows.reduce((t,r)=>t+r.budget,0), ta=rows.reduce((t,r)=>t+r.actual,0), yr=new Date().getFullYear();
  const inp='style="width:100%;padding:8px;border:1px solid var(--border,#ddd);border-radius:8px"';
  const fld=(l,h)=>`<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">${l}</label>${h}</div>`;
  c.innerHTML=`
  <div class="stat-grid">
    <div class="stat-card"><div class="num">${fmtMoney(tb)}</div><div class="lbl">Planned (budget lines)</div></div>
    <div class="stat-card ${ta>tb?'danger':''}"><div class="num">${fmtMoney(ta)}</div><div class="lbl">Actual Incurred</div></div>
    <div class="stat-card gold"><div class="num">${fmtMoney(tb-ta)}</div><div class="lbl">Variance (Budget − Actual)</div></div>
  </div>
  <div class="two-col">
    <div class="panel"><div class="panel-head"><h3>1. Plan Budget Allocation</h3></div><div class="panel-body">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
        ${fld('Account Category',`<input id="bdAcc" list="bdAccList" ${inp}><datalist id="bdAccList">${BD_ACCOUNTS.map(a=>`<option>${a}</option>`).join('')}</datalist>`)}
        ${fld('Department / Business Unit',`<input id="bdDept" ${inp}>`)}
        ${fld('Project (optional)',`<select id="bdProj" ${inp}><option value="">— none —</option>${state.projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>`)}
        ${fld('Period Cycle',`<select id="bdPeriod" onchange="bdPeriodChange()" ${inp}><option>Monthly</option><option>Quarterly</option><option>Annual</option></select>`)}
        ${fld('Timeframe',`<select id="bdTime" ${inp}>${bdTimeframeOpts('Monthly')}</select>`)}
        ${fld('Fiscal Year',`<input id="bdYear" type="number" value="${yr}" ${inp}>`)}
        ${fld('Target Allocation',`<input id="bdAmt" type="number" min="0" ${inp}>`)}
      </div><div style="margin-top:12px"><button class="btn primary" onclick="bdAddLine()">Add Budget Line</button></div></div></div>
    <div class="panel"><div class="panel-head"><h3>2. Record Expenditure</h3></div><div class="panel-body">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">
        ${fld('Budget Line',`<select id="bdActLine" ${inp}><option value="">Select budget line</option>${state.budgetLines.map(l=>`<option value="${l.id}">${esc(bdLineLabel(l))}</option>`).join('')}</select>`)}
        ${fld('Actual Amount Incurred',`<input id="bdActAmt" type="number" min="0" ${inp}>`)}
        ${fld('Date',`<input id="bdActDate" type="date" value="${todayISO()}" ${inp}>`)}
        ${fld('Note',`<input id="bdActNote" ${inp}>`)}
      </div><div style="margin-top:12px"><button class="btn primary" onclick="bdAddActual()">Record Expenditure</button></div>
      <div style="font-size:12px;opacity:.7;margin-top:8px">If the line is linked to a project, the amount is added to that project's actual cost.</div></div></div>
  </div>
  <div class="panel"><div class="panel-head"><h3>Budget vs. Actual Ledger</h3>
    <div style="display:flex;gap:8px"><input placeholder="Search account, dept, period..." value="${esc(bdSearch)}" oninput="bdSearch=this.value;render();var i=document.querySelector('[placeholder^=&quot;Search account&quot;]');i.focus();i.setSelectionRange(i.value.length,i.value.length)" style="padding:6px 10px;border:1px solid var(--border,#ddd);border-radius:8px">
    <button class="btn small" onclick="bdExport()">Export CSV</button><button class="btn small" onclick="bdReset()">Reset</button></div></div>
    <div class="panel-body" style="overflow-x:auto"><table class="data-table" style="width:100%"><thead><tr><th>Account</th><th>Department</th><th>Project</th><th>Period</th><th>Timeframe</th><th>Year</th><th>Budget</th><th>Actual</th><th>Variance</th><th>% Used</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${esc(r.account)}</td><td>${esc(r.department||'—')}</td><td>${r.projectId?esc(projectName(r.projectId)):'—'}</td><td>${r.period}</td><td>${r.timeframe}</td><td>${r.year}</td><td>${fmtMoney(r.budget)}</td><td>${fmtMoney(r.actual)}</td>
      <td style="color:${r.variance<0?'var(--danger)':'var(--success)'}">${fmtMoney(r.variance)}</td><td>${r.used.toFixed(0)}%</td><td>${r.status}</td><td><button class="btn small" onclick="bdDelLine('${r.id}')">Delete</button></td></tr>`).join('')||'<tr><td colspan="12" style="text-align:center;opacity:.6;padding:20px">No budget lines yet. Add one above.</td></tr>'}
    </tbody></table></div></div>
  <h3 style="margin:24px 0 8px">Budget by project</h3>${tmp.innerHTML}`;
  setHeader('Finance','Budgets','');
}
function bdAddLine(){
  bdEnsure(); const g=id=>document.getElementById(id).value;
  const amount=parseFloat(g('bdAmt')); if(!g('bdAcc').trim()||isNaN(amount)) return toast('Enter an account category and target amount.');
  state.budgetLines.push({id:uid('bl'),account:g('bdAcc').trim(),department:g('bdDept').trim(),projectId:g('bdProj')||'',period:g('bdPeriod'),timeframe:g('bdTime'),year:g('bdYear'),amount});
  saveState(); toast('Budget line added.'); render();
}
function bdAddActual(){
  bdEnsure(); const g=id=>document.getElementById(id).value, l=state.budgetLines.find(x=>x.id===g('bdActLine')), amount=parseFloat(g('bdActAmt'));
  if(!l||isNaN(amount)) return toast('Select a budget line and enter an amount.');
  state.budgetActuals.push({id:uid('ba'),lineId:l.id,amount,date:g('bdActDate'),note:g('bdActNote').trim()});
  const p=state.projects.find(x=>x.id===l.projectId); if(p) p.actualCost=(Number(p.actualCost)||0)+amount;
  saveState(); toast('Expenditure recorded.'); render();
}
function bdDelLine(id){
  if(!confirm('Delete this budget line and its recorded expenditure?')) return;
  const l=state.budgetLines.find(x=>x.id===id), sum=state.budgetActuals.filter(a=>a.lineId===id).reduce((t,a)=>t+Number(a.amount||0),0);
  const p=l&&state.projects.find(x=>x.id===l.projectId); if(p) p.actualCost=Math.max(0,(Number(p.actualCost)||0)-sum);
  state.budgetLines=state.budgetLines.filter(x=>x.id!==id); state.budgetActuals=state.budgetActuals.filter(a=>a.lineId!==id); saveState(); render();
}
function bdReset(){
  if(!confirm('Clear ALL budget lines and recorded expenditure? Project actual costs will be reduced accordingly.')) return;
  state.budgetLines.forEach(l=>{ const sum=state.budgetActuals.filter(a=>a.lineId===l.id).reduce((t,a)=>t+Number(a.amount||0),0); const p=state.projects.find(x=>x.id===l.projectId); if(p) p.actualCost=Math.max(0,(Number(p.actualCost)||0)-sum); });
  state.budgetLines=[]; state.budgetActuals=[]; saveState(); render();
}
function bdExport(){
  bdEnsure(); const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const lines=[['Account','Department','Project','Period','Timeframe','Year','Budget','Actual','Variance'].join(',')].concat(state.budgetLines.map(l=>{const a=state.budgetActuals.filter(x=>x.lineId===l.id).reduce((t,x)=>t+Number(x.amount||0),0);return [l.account,l.department,projectName(l.projectId),l.period,l.timeframe,l.year,l.amount,a,l.amount-a].map(q).join(',')}));
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download='budget-vs-actual.csv'; a.click();
}
