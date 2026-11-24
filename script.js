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
  window.location.href='mailto:hello@example.com?subject='+encodeURIComponent('Acacia Plans enquiry')+'&body='+encodeURIComponent(body);
  document.getElementById('contactConfirm').classList.remove('hidden');
  return false;
}

/* Plans uses Tailwind screens, so its home/auth switching is different */
function hpShowHome(){
  authScreen.classList.add('hidden');
  document.getElementById('homePage').style.display='block';
  window.hpShowPage&&window.hpShowPage('top');
}
function hpHideHome(){ document.getElementById('homePage').style.display='none'; }
function hpShowLogin(tab){
  hpHideHome();
  authScreen.classList.remove('hidden');
  switchAuthTab(tab==='register'?'signup':'signin');
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
  var isCloudId = function (id) { return /^(ACC-\d+|company_[A-Za-z0-9_]+)$/i.test(String(id || '')); };
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
    /* paid add-on apps: the company's subscription must include this app (fails open if the status row can't be read) */
    try {
      var ADDON = { crm: 'Acacia CRM', projects: 'Acacia Projects', payroll: 'Acacia Payroll', sell: 'Acacia Sell' };
      var appKey = low(cfg && cfg.app), appName = ADDON[appKey];
      if (appName) {
        var r2 = await req('acacia_company_status?select=*&company_id=eq.' + enc(cid));
        if (r2.ok) {
          var row = (await r2.json())[0];
          if (row) {
            var plan = low(row.plan), apps = String(row.apps || '').split(',').map(function (x) { return low(x); }).filter(Boolean);
            var lapsed = row.paid_until && !isNaN(new Date(row.paid_until)) && new Date(row.paid_until) < new Date();
            if (lapsed || (row.downgraded_at && plan === 'free' && !row.paid_until)) return 'Your Acacia subscription has expired, so ' + appName + ' is locked. Renew it in Books (Subscription) to continue.';
            var legacy = row.all_apps === null || row.all_apps === undefined;      /* companies created before apps were recorded stay open */
            var all = row.all_apps === true || low(row.all_apps) === 'true' || plan === 'all access' || apps.indexOf('*') > -1 || apps.indexOf('all') > -1;
            if (!legacy && !all && apps.indexOf(appKey) < 0) return appName + " is not part of your company's subscription. Ask your company admin to add it under Subscription in Books, or upgrade to All Access.";
          }
        }
      }
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
    try { if (w.AcxSession) await w.AcxSession.start(email, pass, row.company_id); } catch (e) {}
    var d = row.data || {};
    return { companyId: row.company_id, company: d.companyName || '', name: d.fullName || d.username || email.split('@')[0], email: email, role: mapRole(d.role, d), passwordHash: d.passwordHash, passwordSalt: d.passwordSalt };
  }

  async function register(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    var id = await rpc('acx_register_company', { p_company: o.company, p_name: o.name, p_email: low(o.email), p_hash: h, p_salt: salt, p_app: cfg.app, p_plan: o.plan || '', p_billing: o.billing || 'monthly' });
    try { if (w.AcxSession) await w.AcxSession.start(o.email, o.password, id); } catch (e) {}
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
/* ============ Shared auth linked to Acacia ERP (app 1707) ============ */
const SESSION_KEY='acacia_session';
function currentUser(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function initials(n){return (n||'?').split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase()}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))}
function toCompanyId(name){ return 'comp_' + String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'_'); }
function switchAuthTab(t){const s=t==='signin';
  tabSignIn.classList.toggle('text-acacia-700',s);tabSignIn.classList.toggle('border-acacia-600',s);
  tabSignIn.classList.toggle('text-slate-500',!s);tabSignIn.classList.toggle('border-transparent',!s);
  tabSignUp.classList.toggle('text-acacia-700',!s);tabSignUp.classList.toggle('border-acacia-600',!s);
  tabSignUp.classList.toggle('text-slate-500',s);tabSignUp.classList.toggle('border-transparent',s);
  signinForm.classList.toggle('hidden',!s);signupForm.classList.toggle('hidden',s);}

/* Sidepanel toggle functions */
function toggleAcaciaNotebook(){ document.getElementById('acaciaNotebookPanel')?.classList.toggle('hidden'); }
function toggleWebinarPanel(){ document.getElementById('webinarPanel')?.classList.toggle('hidden'); }
function toggleCommPanel(){ document.getElementById('commPanel')?.classList.toggle('hidden'); }
function toggleSupportPopup(){ document.getElementById('supportPopup')?.classList.toggle('hidden'); }

/* Supabase client (shared project with Acacia ERP) */
const sb = window.supabase.createClient(window.__SUPA_URL__, window.__SUPA_KEY__);

AcaciaCloud.init({app:'Plans', dataKey:function(c){ return 'acx_plans_local_' + c; }});
const enc = encodeURIComponent;

async function accountExists(email){
  try{ const r = await AcaciaCloud.req('app_accounts?select=login_id&login_id=eq.' + enc(String(email).toLowerCase())); if(!r.ok) return false; return (await r.json()).length > 0; }catch(e){ return false; }
}
function authErr(el, msg){ el.textContent = msg; el.classList.remove('hidden'); }

async function doSignIn(e){
  e.preventDefault();
  siError.classList.add('hidden');
  const company=(siCompany.value||'').trim();
  const email=(siEmail.value||'').trim().toLowerCase();
  const pass=siPass.value;
  if(!company||!email||!pass){ authErr(siError,'Please enter your company name, email and password.'); return; }
  let u=null;
  try{ u = await AcaciaCloud.signIn(email, pass, company); }
  catch(err){ authErr(siError, err.code==='blocked' ? err.message : 'Could not reach Acacia. Check your internet connection and try again.'); return; }
  if(!u){ authErr(siError,'That email and password combination was not found.'); return; }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email:u.email, name:u.name, companyId:u.companyId, companyName:u.company }));
  boot();
}

async function doSignUp(e){
  e.preventDefault();
  suError.classList.add('hidden');
  const company=(suCompany.value||'').trim();
  const email=(suEmail.value||'').trim().toLowerCase();
  const pass=suPass.value;
  if(!company||!email){ authErr(suError,'Company name and email are required.'); return; }
  if(!pass||pass.length<6){ authErr(suError,'Password must be at least 6 characters.'); return; }
  const fullName=((suFirst.value||'')+' '+(suLast.value||'')).trim()||email;
  let r;
  try{ r = await AcaciaCloud.register({company, name:fullName, email, password:pass, plan:(document.getElementById('regPlan')||{}).value||'', billing:(document.getElementById('regBilling')||{}).value||'monthly'}); }
  catch(err){ authErr(suError, err.code==='exists' ? 'This company already has an account with that email - use Sign In instead.' : (err.code==='offline' ? 'Could not reach Acacia. Check your internet connection and try again.' : (err.message||'Could not create the account.'))); return; }
  if(r.blocked){ authErr(suError,'Account created. ' + r.blocked); return; }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email, name:fullName, companyId:r.companyId, companyName:company }));
  boot();
}

function signOut(){AcaciaCloud.stop();localStorage.removeItem(SESSION_KEY);location.reload()}
function toggleApps(){appsMenu.classList.toggle('hidden')}
document.addEventListener('click',e=>{if(!e.target.closest('#appsMenu')&&!e.target.closest('button[onclick*=toggleApps]')) appsMenu?.classList.add('hidden')});

/* ============ Company-scoped keys (matches app 1707's getCompanyKey) ============ */
function currentCompanyId(){ const u=currentUser(); return u?.companyId || 'default_company'; }
function scopedKey(k){ return k + '_' + currentCompanyId(); }

/* Plans Hub modules: the same records Acacia Books uses in its Plans Hub
   (Plan Hub, Plan Progress, Plan Revenue). Keys match Books' storage keys. */
const MODULES = [
  { id:'plans',     label:'Plan Hub',        key:'plans' },
  { id:'ownership', label:'Ownership',       key:'planOwnerships',  link:'planTitle', group:'Plan Progress' },
  { id:'progress',  label:'Track Progress',  key:'planProgress',    link:'title' },
  { id:'expenses',  label:'Track Expenses',  key:'operationalCosts',link:'planTitle', readonly:true },
  { id:'revisions', label:'Review & Revise', key:'planRevisions',   link:'title' },
  { id:'actions',   label:'Action Plan',     key:'planActionItems', link:'title' },
  { id:'revenue',   label:'Plan Revenue',    key:'planRevenue',     link:'planTitle', group:'Revenue' },
  { id:'employees', label:'Employees',       key:'employees',       hidden:true, readonly:true },
];

const PRIORITY = ['High','Medium','Low'];
const STATUS_OWN = ['Not Started','In Progress','Completed','On Hold'];
const STATUS_PROG = ['Not Started','In Progress','Completed','Delayed','On Hold'];
const GOALS = ['Increase Sales / Revenue','Strategic','Operational','Performance','Development','Cost Reduction'];

/* Field layout per module (t: text | select | date | number | textarea | multi; o: options or 'employees') */
const FIELDS = {
  plans: [
    { k:'title', l:'Plan title', req:1 },
    { k:'department', l:'Department' },
    { k:'goalType', l:'Goal type', t:'select', o:GOALS },
    { k:'priority', l:'Priority', t:'select', o:PRIORITY },
    { k:'startDate', l:'Start date', t:'date' },
    { k:'endDate', l:'End date', t:'date' },
    { k:'target', l:'Target' },
    { k:'targetAmount', l:'Target amount (KES)', t:'number' },
    { k:'linkedBudget', l:'Linked budget' },
    { k:'description', l:'Description', t:'textarea' },
  ],
  ownership: [
    { k:'owner', l:'Owner', t:'select', o:'employees' },
    { k:'team', l:'Team', t:'multi', o:'employees' },
    { k:'status', l:'Status', t:'select', o:STATUS_OWN },
    { k:'date', l:'Date', t:'date' },
  ],
  progress: [
    { k:'progress', l:'Progress %', t:'number', req:1 },
    { k:'status', l:'Status', t:'select', o:STATUS_PROG },
    { k:'person', l:'Updated by' },
    { k:'comment', l:'Comment', t:'textarea' },
  ],
  revisions: [
    { k:'action', l:'Action', t:'select', o:['Extend (new end date)','Revise','Close plan'] },
    { k:'newEndDate', l:'New end date (for Extend)', t:'date' },
    { k:'comment', l:'Comment', t:'textarea' },
  ],
  actions: [
    { k:'item', l:'Action item', req:1 },
    { k:'person', l:'Responsible person' },
    { k:'due', l:'Due date', t:'date' },
    { k:'priority', l:'Priority', t:'select', o:PRIORITY },
    { k:'status', l:'Status', t:'select', o:STATUS_PROG },
    { k:'notes', l:'Notes', t:'textarea' },
  ],
  revenue: [
    { k:'customer', l:'Customer' },
    { k:'amount', l:'Amount (KES)', t:'number', req:1 },
    { k:'fund', l:'Bank / fund' },
    { k:'note', l:'Note' },
  ],
};

/* Table columns per module: [key, heading] */
const COLS = {
  ownership: [['owner','Owner'],['team','Team'],['status','Status'],['date','Date']],
  progress:  [['progress','Progress'],['status','Status'],['person','Updated by'],['comment','Comment'],['date','Date']],
  expenses:  [['date','Date'],['description','Description'],['category','Category'],['bank','Bank'],['amount','Amount']],
  revisions: [['action','Action'],['comment','Comment'],['date','Date']],
  actions:   [['item','Action item'],['person','Person'],['due','Due'],['priority','Priority'],['status','Status'],['notes','Notes']],
  revenue:   [['source','Source'],['invoiceNumber','Invoice'],['customer','Customer'],['amount','Amount'],['fund','Bank / fund'],['date','Date']],
};

const store = {};                 // { moduleId: [rows] }
let active = MODULES[0].id;

function setSync(status, tone){
  syncStatus.textContent = status;
  const dot = syncDot; dot.className = 'inline-block w-2 h-2 rounded-full ' +
    ({ok:'bg-emerald-500',busy:'bg-amber-400 animate-pulse',err:'bg-red-500',idle:'bg-slate-300'}[tone]||'bg-slate-300');
}

let pullErr=null;
async function pullOne(m){
  try {
    const r = await AcaciaCloud.req('company_state?select=value&company_id=eq.' + enc(currentCompanyId()) + '&key=eq.' + enc(m.key));
    if(!r.ok) throw new Error('HTTP ' + r.status);
    let v = ((await r.json())[0] || {}).value;
    if(typeof v === 'string'){ try{ v = JSON.parse(v); }catch(e){ v = []; } }
    store[m.id] = Array.isArray(v) ? v : [];
  } catch(e) {
    console.warn(`Failed pulling key ${m.key}:`, e);
    pullErr=(e&&e.message)||String(e);
    store[m.id] = [];
  }
}
async function pullAll(){
  setSync('syncing…','busy');
  try{
    pullErr=null;
    await Promise.all(MODULES.map(pullOne));
    const anyData = MODULES.some(m=>Array.isArray(store[m.id]) && store[m.id].length);
    if(pullErr){ setSync('sync error · '+String(pullErr).slice(0,70),'err'); }
    else if(!anyData){ setSync('connected · no Books data for company '+currentCompanyId(),'idle'); }
    else { setSync('synced · '+(currentUser()?.companyName||'workspace'),'ok'); }
    try{ syncStatus.title = 'Company ID: '+currentCompanyId()+(pullErr?' · '+pullErr:''); }catch(_){}
    renderView();
  }catch(e){ console.warn(e); setSync('sync error','err'); }
}
async function pushOne(m){
  setSync('saving…','busy');
  try{
    const r = await AcaciaCloud.req('company_state?on_conflict=company_id,key', { method:'POST', headers:{ apikey:AcaciaCloud.KEY, Authorization:'Bearer '+AcaciaCloud.KEY, 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ company_id: currentCompanyId(), key: m.key, value: JSON.stringify(store[m.id]||[]), updated_at: new Date().toISOString() }) });
    if(!r.ok) throw new Error('HTTP ' + r.status);
  }catch(error){ setSync('save error','err'); alert('Save failed: '+error.message); return false; }
  setSync('synced · '+(currentUser()?.companyName||'workspace'),'ok'); return true;
}

/* ============ Plans Hub views ============ */
function cellText(v){ if(v==null) return ''; if(typeof v==='object') return JSON.stringify(v); return String(v); }

let selPlan = '';        // title of the plan chosen in the picker
let editIdx = null;      // index (in store[module]) of the record being edited

const plansList = () => store.plans || [];
const empNames = () => (store.employees || []).map(e => e && (e.name || e['Full Name'])).filter(Boolean);
const nowStr = () => new Date().toLocaleString();
const todayStr = () => new Date().toISOString().slice(0,10);
const fmtKES = n => 'KES ' + (parseFloat(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const collected = t => (store.revenue||[]).filter(r => r && r.planTitle===t).reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
function curPlan(){
  const ps = plansList();
  if(!ps.some(p => p && p.title===selPlan)) selPlan = (ps[0] && ps[0].title) || '';
  return ps.find(p => p && p.title===selPlan) || null;
}
function setPlan(v){ selPlan = v; renderView(); }
function cell(k, v, row){
  if(Array.isArray(v)) v = v.join(', ');
  if(k==='progress' && v!=='' && v!=null) return escapeHtml(v + '%');
  if(k==='amount' || k==='targetAmount') return escapeHtml((parseFloat(v)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}));
  if(k==='source') return v==='invoice' ? '🧾 Invoice' : '✍️ Manual';
  if(k==='bank') return escapeHtml(v || (row && row.currentAccName) || '');
  return escapeHtml(cellText(v));
}
const statusBadge = s => `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${({'Completed':'bg-emerald-100 text-emerald-700','In Progress':'bg-blue-100 text-blue-700','Delayed':'bg-red-100 text-red-700','On Hold':'bg-amber-100 text-amber-700'}[s])||'bg-slate-100 text-slate-600'}">${escapeHtml(s||'Not Started')}</span>`;

function renderNav(){
  let last = '';
  navList.innerHTML = MODULES.filter(m => !m.hidden).map(m => {
    let head = '';
    if(m.group && m.group !== last){ last = m.group; head = `<div class="text-[10px] font-bold uppercase text-slate-400 px-2 pt-4 pb-1">${escapeHtml(m.group)}</div>`; }
    return head + `<button onclick="go('${m.id}')" class="nav-btn w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 ${m.id===active?'active':''}">${escapeHtml(m.label)}</button>`;
  }).join('')
    + `<div class="text-[10px] font-bold uppercase text-slate-400 px-2 pt-4 pb-1">Settings</div><button onclick="go('appearance')" class="nav-btn w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 ${active==='appearance'?'active':''}">🎨 Appearance</button>`;
}
function go(id){ active = id; editIdx = null; renderNav(); renderView(); }

function renderView(){
  if(active==='appearance'){ view.innerHTML = '<div class="mb-4"><h2 class="text-2xl font-bold text-slate-800">🎨 Appearance</h2><p class="text-sm text-slate-500">Sidebar colour, text colour, font and font size.</p></div><div data-acacia-appearance></div>'; return; }
  const m = MODULES.find(x => x.id===active);
  if(m.id==='plans') return renderPlans(m);
  return renderLinked(m);
}

/* ---- Plan Hub dashboard (KPIs, plan cards, portfolio, progress, actions, activity) ---- */
function planDash(){
  const A = ADX, C = A.C, ps = plansList().filter(Boolean), today = todayStr();
  const prog = p => Math.max(0, Math.min(100, parseFloat(p.progress)||0));
  const late = p => p.endDate && p.endDate < today && p.status !== 'Completed';
  const done = ps.filter(p=>p.status==='Completed'), delayed = ps.filter(late);
  const running = ps.filter(p=>p.status==='In Progress');
  const avg = ps.length ? Math.round(ps.reduce((s,p)=>s+prog(p),0)/ps.length) : 0;
  const upd = (store.progress||[]).filter(r=>r && r.date && !isNaN(new Date(r.date)));
  const ms = A.months(6), byM = {};
  upd.forEach(r=>{ const d = new Date(r.date), k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); (byM[k] = byM[k]||[]).push(parseFloat(r.progress)||0); });
  const trend = ms.map(m=>({l:m.l, v: byM[m.k] ? Math.round(byM[m.k].reduce((a,b)=>a+b,0)/byM[m.k].length) : null}));
  let last = 0; trend.forEach(t=>{ if(t.v==null) t.v = last; else last = t.v; });
  const acts = (store.actions||[]).filter(r=>r && r.due && r.status!=='Completed').sort((a,b)=>String(a.due).localeCompare(String(b.due))).slice(0,4);
  const recent = [...upd].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);
  const team = t => { const o = (store.ownership||[]).filter(r=>r && r.planTitle===t); return o.reduce((n,r)=>n+(Array.isArray(r.team)?r.team.length:0),0) || o.length; };
  const idx = p => plansList().indexOf(p);
  const cards = ps.slice(0,6).map(p=>`<div class="adx-plan"><h4>${escapeHtml(p.title)}</h4><p>${escapeHtml(p.department||p.goalType||'Plan')}</p>${A.hb('Progress', prog(p))}<div class="m"><span>Due: ${escapeHtml(p.endDate||'not set')}</span><span>${team(p.title)} team</span></div><div style="text-align:right;margin-top:6px"><button class="adx-btn" onclick="openPlan(${idx(p)})">View Plan</button></div></div>`).join('');
  const rev = ps.filter(p=>parseFloat(p.targetAmount)>0).slice(0,5);
  return `<div class="adx-wrap" style="margin-bottom:6px">
  <div class="adx-grid adx-g4">
    ${A.kpi({i:'file',l:'Total Plans',v:ps.length,d:`<div class="adx-d fl">${running.length} in progress</div>`})}
    ${A.kpi({i:'folder',c:'b',l:'Active Plans',v:running.length})}
    ${A.kpi({i:'check',c:'o',l:'Completed Plans',v:done.length})}
    ${A.kpi({i:'clock',c:'p',l:'Average Progress',v:avg+'%',d:`<div class="adx-d ${delayed.length?'dn':'fl'}">${delayed.length} past due date</div>`})}
  </div>
  <div class="adx-grid adx-g21">
    ${A.panel('Your Plans', ps.length ? `<div class="adx-plans">${cards}</div>` : '<div class="adx-empty">No plans yet. Click <b>+ New Plan</b> to create your first plan, or create one in Acacia Books.</div>', {i:'file'})}
    <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
      ${A.panel('Plan Portfolio', ps.length ? A.donut([{v:running.length-delayed.filter(p=>p.status==='In Progress').length,c:C.g,l:'On Track'},{v:delayed.length,c:C.o,l:'Delayed'},{v:done.length,c:C.b,l:'Completed'},{v:ps.length-running.length-done.length-delayed.filter(p=>p.status!=='In Progress').length,c:C.gl,l:'Not started'}].map(x=>({...x,v:Math.max(0,x.v)})), ps.length, 'Plans') : '<div class="adx-empty">No plans yet.</div>', {i:'chart'})}
      ${A.panel('Plan Progress', A.line(trend, {pct:true, max:100}), {i:'trend'})}
    </div>
  </div>
  <div class="adx-grid adx-g111">
    ${A.panel('Upcoming Actions', acts.length ? acts.map(a=>A.row('check', `${escapeHtml(a.item||'')}<div style="font-size:11.5px;color:var(--ax-mut)">${escapeHtml(a.title||'')}</div>`, escapeHtml(a.due), "go('actions')")).join('') : '<div class="adx-empty">No open action items.</div>', {i:'clock', link:['View all',"go('actions')"]})}
    ${A.panel('Recent Activities', recent.length ? recent.map(r=>A.row('', `Progress ${escapeHtml(r.progress)}% on <b>${escapeHtml(r.title||'')}</b>`, escapeHtml(r.person||''), "go('progress')")).join('') : '<div class="adx-empty">Progress updates will show here.</div>', {i:'trend'})}
    ${A.panel('Revenue vs Target', rev.length ? rev.map(p=>{ const t = parseFloat(p.targetAmount)||1; return A.hb(p.title, collected(p.title)/t*100, 'KES '+A.short(collected(p.title))+' / '+A.short(t)); }).join('') : '<div class="adx-empty">Set a target amount on a plan to track revenue.</div>', {i:'cash', link:['Revenue',"go('revenue')"]})}
  </div>
  </div>`;
}

/* ---- Plan Hub: create plans + All Plans ---- */
function renderPlans(m){
  const ps = plansList();
  const done = ps.filter(p => p.status==='Completed').length;
  const run = ps.filter(p => p.status==='In Progress').length;
  const target = ps.reduce((s,p)=>s+(parseFloat(p.targetAmount)||0),0);
  const got = ps.reduce((s,p)=>s+collected(p.title),0);
  view.innerHTML = `
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div><h2 class="text-2xl font-bold text-slate-800">🗂️ Plan Hub</h2>
        <p class="text-sm text-slate-500">Create plans and track them from start to finish · same plans as Acacia Books</p></div>
      <div class="flex gap-2">
        <input id="planSearch" oninput="filterPlans()" placeholder="Search plans…" class="h-9 px-3 text-sm border border-slate-200 rounded-lg outline-none"/>
        <button onclick="exportCsv()" class="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Export CSV</button>
        <button onclick="openForm()" class="px-4 py-2 text-sm bg-acacia-600 hover:bg-acacia-700 text-white rounded-lg font-semibold">+ New Plan</button>
      </div>
    </div>
    ${planDash()}
    <h3 class="font-bold mb-2" style="font-family:var(--ax-serif);font-size:18px">All Plans</h3>
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden"><div class="overflow-x-auto">
      <table class="w-full text-sm"><thead class="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
        <th class="px-3 py-2">Plan</th><th class="px-3 py-2">Department</th><th class="px-3 py-2">Goal</th><th class="px-3 py-2">Priority</th>
        <th class="px-3 py-2">Dates</th><th class="px-3 py-2 text-right">Target</th><th class="px-3 py-2 text-right">Collected</th>
        <th class="px-3 py-2">Progress</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Owner</th><th class="px-3 py-2"></th></tr></thead>
        <tbody id="plansBody"></tbody></table></div></div>`;
  filterPlans();
}
function filterPlans(){
  const q = ((document.getElementById('planSearch')||{}).value||'').toLowerCase();
  const rows = plansList().map((p,i)=>({p,i})).filter(x => x.p && (!q || JSON.stringify(x.p).toLowerCase().includes(q)));
  const body = document.getElementById('plansBody'); if(!body) return;
  body.innerHTML = rows.length ? rows.map(({p,i}) => {
    const pct = Math.max(0,Math.min(100,parseFloat(p.progress)||0));
    return `<tr class="border-t border-slate-100 hover:bg-slate-50 align-top">
      <td class="px-3 py-2 font-semibold">${escapeHtml(p.title)}</td><td class="px-3 py-2">${escapeHtml(p.department||'')}</td>
      <td class="px-3 py-2">${escapeHtml(p.goalType||'')}</td><td class="px-3 py-2">${escapeHtml(p.priority||'')}</td>
      <td class="px-3 py-2 whitespace-nowrap">${escapeHtml(p.startDate||'?')} → ${escapeHtml(p.endDate||'?')}</td>
      <td class="px-3 py-2 text-right">${cell('targetAmount',p.targetAmount)}</td><td class="px-3 py-2 text-right">${cell('amount',collected(p.title))}</td>
      <td class="px-3 py-2 min-w-[110px]"><div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-2 bg-acacia-600" style="width:${pct}%"></div></div><div class="text-[11px] text-slate-500 mt-1">${pct}%</div></td>
      <td class="px-3 py-2">${statusBadge(p.status)}</td><td class="px-3 py-2">${escapeHtml(p.owner||'')}</td>
      <td class="px-3 py-2 acx-cell">${ACX_ACT({view:`openPlan('${i}')`, edit:`openForm(${i})`, clone:`cloneRow(${i})`, del:`delRow(${i})`, title:'Plan — '+(p.title||'')})}</td></tr>`;
  }).join('') : `<tr><td colspan="11" class="text-center text-slate-400 py-10">No plans yet. Click <b>+ New Plan</b> to create your first plan, or create one in Acacia Books.</td></tr>`;
}
function openPlan(i){ const p = plansList()[i]; if(p){ selPlan = p.title; go('ownership'); } }

/* ---- Plan Progress / Revenue sub-modules (always for one chosen plan) ---- */
function renderLinked(m){
  const ps = plansList(), plan = curPlan();
  if(!plan){
    view.innerHTML = `<h2 class="text-2xl font-bold text-slate-800 mb-2">${escapeHtml(m.label)}</h2>
      <div class="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">Create a plan first in the <b>Plan Hub</b>.<br><button onclick="go('plans')" class="mt-4 px-4 py-2 text-sm bg-acacia-600 hover:bg-acacia-700 text-white rounded-lg font-semibold">Go to Plan Hub</button></div>`;
    return;
  }
  const rows = (store[m.id]||[]).map((r,i)=>({r,i})).filter(x => x.r && x.r[m.link]===plan.title);
  const cols = COLS[m.id];
  let extra = '';
  if(m.id==='revenue'){
    const got = collected(plan.title), tgt = parseFloat(plan.targetAmount)||0, pct = tgt ? Math.min(100,Math.round(got/tgt*100)) : 0;
    extra = `<div class="bg-white rounded-xl border border-slate-200 p-4 mb-4 grid md:grid-cols-3 gap-4">
      <div><div class="text-[11px] uppercase font-semibold text-slate-400">Collected</div><div class="text-lg font-bold">${fmtKES(got)}</div></div>
      <div><div class="text-[11px] uppercase font-semibold text-slate-400">Target</div><div class="text-lg font-bold">${tgt?fmtKES(tgt):'—'}</div></div>
      <div><div class="text-[11px] uppercase font-semibold text-slate-400">Achieved</div><div class="text-lg font-bold">${tgt?pct+'%':'—'}</div><div class="h-2 bg-slate-100 rounded-full mt-1 overflow-hidden"><div class="h-2 bg-emerald-500" style="width:${pct}%"></div></div></div></div>`;
  }
  if(m.id==='expenses'){
    const tot = rows.reduce((s,x)=>s+(parseFloat(x.r.amount)||0),0);
    extra = `<div class="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2 mb-4">Plan expenses are recorded as Operational Costs in Acacia Books so they post to your bank and ledger. They show here for this plan. Total: <b>${fmtKES(tot)}</b></div>`;
  }
  view.innerHTML = `
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div><h2 class="text-2xl font-bold text-slate-800">${escapeHtml(m.label)}</h2>
        <p class="text-sm text-slate-500">${rows.length} record${rows.length===1?'':'s'} for this plan · live from Acacia Books</p></div>
      <div class="flex gap-2 items-center">
        <select onchange="setPlan(this.value)" class="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white max-w-[260px]">
          ${ps.map(p=>`<option value="${escapeHtml(p.title)}" ${p.title===plan.title?'selected':''}>${escapeHtml(p.title)}</option>`).join('')}</select>
        <button onclick="exportCsv()" class="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Export CSV</button>
        ${m.readonly?'':`<button onclick="openForm()" class="px-4 py-2 text-sm bg-acacia-600 hover:bg-acacia-700 text-white rounded-lg font-semibold">+ New</button>`}
      </div>
    </div>
    <div class="text-xs text-slate-500 mb-3">${escapeHtml(plan.startDate||'?')} → ${escapeHtml(plan.endDate||'?')} · ${statusBadge(plan.status)} · progress ${parseFloat(plan.progress)||0}%${plan.owner?' · owner '+escapeHtml(plan.owner):''}</div>
    ${extra}
    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden"><div class="overflow-x-auto">
      <table class="w-full text-sm"><thead class="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>
        ${cols.map(c=>`<th class="px-3 py-2 ${c[0]==='amount'?'text-right':''}">${escapeHtml(c[1])}</th>`).join('')}<th class="px-3 py-2 acx-cell">Actions</th></tr></thead>
        <tbody>${rows.length ? rows.map(({r,i}) => `<tr class="border-t border-slate-100 hover:bg-slate-50 align-top">
          ${cols.map(c=>`<td class="px-3 py-2 max-w-xs ${c[0]==='amount'?'text-right':''}">${c[0]==='status'?statusBadge(r[c[0]]):cell(c[0],r[c[0]],r)}</td>`).join('')}
          <td class="px-3 py-2 acx-cell">${m.readonly||m.id==='revenue' ? ACX_ACT({del: m.readonly?'':`delRow(${i})`}) : ACX_ACT({edit:`openForm(${i})`, clone:`cloneRow(${i})`, del:`delRow(${i})`})}</td></tr>`).join('')
          : `<tr><td colspan="${cols.length+1}" class="text-center text-slate-400 py-10">${m.readonly?'No expenses logged against this plan yet.':'No records for this plan yet. Click <b>+ New</b> to add one.'}</td></tr>`}</tbody></table></div></div>`;
}

/* ---- Add / edit form (modal) ---- */
function openForm(i){
  const m = MODULES.find(x => x.id===active); if(m.readonly) return;
  editIdx = (i===undefined) ? null : i;
  const old = editIdx!==null ? (store[m.id]||[])[editIdx] : null;
  const names = empNames();
  entryModalTitle.textContent = (old ? 'Edit ' : 'Add ') + (m.id==='plans' ? 'Plan' : m.label);
  const cls = 'w-full px-3 rounded-lg border border-slate-300 outline-none text-sm focus:border-acacia-500 focus:ring-1 focus:ring-acacia-500';
  entryModalFields.innerHTML = FIELDS[m.id].map(f => {
    const v = old ? old[f.k] : (f.k==='date' ? todayStr() : (f.k==='status' ? 'Not Started' : (f.k==='priority' ? 'Medium' : '')));
    let input;
    if(f.t==='select'){
      let opts = f.o==='employees' ? ['', ...names] : f.o;
      if(v && !opts.includes(v)) opts = [...opts, v];
      input = `<select data-field="${f.k}" class="${cls} h-10 bg-white">${opts.map(o=>`<option value="${escapeHtml(o)}" ${o===v?'selected':''}>${o===''?'-- Select --':escapeHtml(o)}</option>`).join('')}</select>`;
    } else if(f.t==='multi'){
      const sel = Array.isArray(v) ? v : [];
      input = `<select data-field="${f.k}" multiple size="4" class="${cls} bg-white py-1">${names.map(o=>`<option value="${escapeHtml(o)}" ${sel.includes(o)?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>${names.length?'<p class="text-[11px] text-slate-400 mt-1">Hold Ctrl / Cmd to pick several.</p>':'<p class="text-[11px] text-slate-400 mt-1">Add employees in Acacia Books to pick a team.</p>'}`;
    } else if(f.t==='textarea'){
      input = `<textarea data-field="${f.k}" rows="3" class="${cls} py-2">${escapeHtml(v||'')}</textarea>`;
    } else {
      const lock = (m.id==='plans' && f.k==='title' && old) ? 'readonly title="The title links this plan\'s records, so it cannot be changed."' : '';
      input = `<input data-field="${f.k}" type="${f.t||'text'}" ${f.t==='number'?'step="any" min="0"'+(f.k==='progress'?' max="100"':''):''} ${f.req?'required':''} ${lock} value="${escapeHtml(v==null?'':v)}" class="${cls} h-10 ${lock?'bg-slate-50':''}"/>`;
    }
    return `<div><label class="block text-xs font-semibold text-slate-600 mb-1">${escapeHtml(f.l)}</label>${input}</div>`;
  }).join('');
  entryModal.classList.remove('hidden');
}
function closeEntryModal(){ entryModal.classList.add('hidden'); entryModalForm.reset(); editIdx = null; }

async function saveNewRecord(e){
  e.preventDefault();
  const m = MODULES.find(x => x.id===active), fields = FIELDS[m.id], rec = {};
  fields.forEach(f => {
    const el = entryModalFields.querySelector(`[data-field="${f.k}"]`); if(!el) return;
    if(f.t==='multi') rec[f.k] = [...el.selectedOptions].map(o => o.value);
    else if(f.t==='number') rec[f.k] = el.value==='' ? 0 : (parseFloat(el.value)||0);
    else rec[f.k] = el.value.trim();
  });
  const rows = [...(store[m.id]||[])], old = editIdx!==null ? rows[editIdx] : null;
  let plan = null, touchPlans = false;

  if(m.id==='plans'){
    if(!rec.title) return alert('Please enter a plan title.');
    if(!old && plansList().some(p => p.title===rec.title)) return alert('A plan with this title already exists.');
    if(old) rows[editIdx] = Object.assign({}, old, rec, { title: old.title });
    else rows.push(Object.assign({ progress:0, status:'Not Started', owner:'', team:[], dateCreated:nowStr() }, rec));
    if(!old) selPlan = rec.title;
  } else {
    plan = curPlan(); if(!plan) return alert('Create/select a plan first.');
    rec[m.link] = plan.title;
    if(m.id==='ownership'){ rec.date = rec.date || todayStr(); Object.assign(plan,{owner:rec.owner,team:rec.team,status:rec.status}); touchPlans = true; }
    if(m.id==='progress'){ rec.progress = Math.max(0,Math.min(100,rec.progress)); rec.date = nowStr(); Object.assign(plan,{progress:rec.progress,status:rec.status}); touchPlans = true; }
    if(m.id==='revisions'){ rec.date = nowStr(); if(/^Extend/.test(rec.action) && rec.newEndDate){ plan.endDate = rec.newEndDate; touchPlans = true; } }
    if(m.id==='actions'){ rec.date = old ? old.date : nowStr(); }
    if(m.id==='revenue'){
      if(rec.amount<=0) return alert('Enter an amount greater than zero.');
      Object.assign(rec,{ id:Date.now()+Math.random(), source:'manual', invoiceNumber:'', invDate:'', date:nowStr() });
    }
    if(old) rows[editIdx] = Object.assign({}, old, rec); else rows.push(rec);
  }
  store[m.id] = rows;
  if(m.id==='revenue') touchPlans = syncRevenueProgress(plan) || touchPlans;
  closeEntryModal();

  let ok = await pushOne(m);
  if(ok && touchPlans) ok = await pushOne(MODULES[0]);
  if(ok) renderView(); else await Promise.all([pullOne(m), pullOne(MODULES[0])]).then(renderView);
}

/* Books' rule: when a target amount is set, progress follows revenue collected */
function syncRevenueProgress(plan){
  if(!plan) return false;
  const got = collected(plan.title), tgt = parseFloat(plan.targetAmount)||0;
  if(tgt<=0) return false;
  plan.progress = Math.min(100, Math.round(got/tgt*100));
  plan.status = plan.progress>=100 ? 'Completed' : plan.progress>0 ? 'In Progress' : plan.status;
  return true;
}

/* Clone — same as Books: copy the record, plans get a unique "(copy)" title */
async function cloneRow(i){
  const m = MODULES.find(x => x.id===active); if(!m || m.readonly || m.id==='revenue') return;
  const src = (store[m.id]||[])[i]; if(!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  if(m.id==='plans'){
    let t = (src.title||'Plan')+' (copy)', n = 2;
    while(plansList().some(p => p.title===t)) t = (src.title||'Plan')+' (copy '+(n++)+')';
    Object.assign(copy,{ title:t, progress:0, status:'Not Started', dateCreated:nowStr() });
  } else { copy.date = nowStr(); delete copy.id; }
  store[m.id] = [...(store[m.id]||[]), copy];
  if(await pushOne(m)) renderView(); else await pullOne(m).then(renderView);
}
async function delRow(i){
  const m = MODULES.find(x => x.id===active); if(m.readonly) return;
  const msg = m.id==='plans' ? 'Delete this plan? Records already linked to it (progress, revenue, etc.) are kept in Acacia Books.' : 'Delete this record from Acacia Books?';
  if(!confirm(msg)) return;
  store[m.id].splice(i,1);
  let touch = false;
  if(m.id==='revenue') touch = syncRevenueProgress(curPlan());
  let ok = await pushOne(m);
  if(ok && touch) ok = await pushOne(MODULES[0]);
  if(ok) renderView(); else await Promise.all([pullOne(m), pullOne(MODULES[0])]).then(renderView);
}

function exportCsv(){
  const m = MODULES.find(x => x.id===active);
  let head, lines;
  if(m.id==='plans'){
    head = FIELDS.plans.map(f=>f.k).concat(['progress','status','owner']);
    lines = plansList().map(p => head.map(c => JSON.stringify(cellText(p[c]))).join(','));
  } else {
    const plan = curPlan(); if(!plan) return;
    const cols = COLS[m.id].map(c=>c[0]);
    head = cols;
    lines = (store[m.id]||[]).filter(r => r && r[m.link]===plan.title).map(r => cols.map(c => JSON.stringify(cellText(r[c]))).join(','));
  }
  const a = document.createElement('a'); a.href = 'data:text/csv,' + encodeURIComponent([head.join(','), ...lines].join('\n')); a.download = m.key + '.csv'; a.click();
}

/* ============ Acacia Mail bridge ============ */
const MAIL_DATA_PREFIX = 'acacia_data_';
function openMail(){ mmStatus.textContent=''; mmTo.value=''; mmSubject.value=''; mmBody.value=''; mailModal.classList.remove('hidden'); }
function closeMail(){ mailModal.classList.add('hidden'); }
function loadMailbox(email){
  try{ return JSON.parse(localStorage.getItem(MAIL_DATA_PREFIX+email)) || {mails:[],events:[],aiChat:[]}; }
  catch{ return {mails:[],events:[],aiChat:[]}; }
}
function saveMailbox(email, box){
  localStorage.setItem(MAIL_DATA_PREFIX+email, JSON.stringify(box));
  try{ sb.from('app_state').upsert({ key: MAIL_DATA_PREFIX+email, value: box, updated_at:new Date().toISOString() }, { onConflict:'key' }); }catch(e){}
}
async function sendMailFromApp(e){
  e.preventDefault();
  const u = currentUser();
  if(!u){ mmStatus.textContent='Sign in first.'; return; }
  const to = mmTo.value.trim().toLowerCase();
  const subject = mmSubject.value.trim();
  const bodyText = mmBody.value.trim();
  if(!to||!subject||!bodyText) return;
  mmStatus.textContent = 'Verifying recipient…';
  const recipient = (await accountExists(to)) ? { email: to } : null;
  if(!recipient){
    mmStatus.textContent = '❌ No Acacia account uses that email. The message was not sent.';
    return;
  }
  const bodyHtml = escapeHtml(bodyText).replace(/\n/g,'<br>');
  const now = Date.now();
  const mailId = 'm'+now;

  const inbox = loadMailbox(recipient.email);
  inbox.mails = inbox.mails || [];
  inbox.mails.unshift({
    id: mailId,
    from: u.name || u.email,
    email: u.email,
    to: recipient.email,
    subject, preview: bodyText.slice(0,90), body: bodyHtml,
    time: now, read: false, starred: false, folder: 'inbox'
  });
  saveMailbox(recipient.email, inbox);

  const sent = loadMailbox(u.email);
  sent.mails = sent.mails || [];
  sent.mails.unshift({
    id: mailId+'_s',
    from: u.name || u.email,
    email: recipient.email,
    to: recipient.email,
    subject, preview: bodyText.slice(0,90), body: bodyHtml,
    time: now, read: true, starred: false, folder: 'sent'
  });
  saveMailbox(u.email, sent);

  mmStatus.textContent = '✅ Sent to '+recipient.email+' — will appear in their Acacia Mail inbox.';
  setTimeout(closeMail, 1200);
}

function boot(){
  let u=currentUser();
  if(u && !AcaciaCloud.isCloudId(u.companyId)){ localStorage.removeItem(SESSION_KEY); u=null; }
  if(u){ AcaciaCloud.start({companyId:u.companyId, email:u.email, role:'admin'}).then(function(r){ if(String(r).indexOf('blocked:')===0){ alert(String(r).slice(8)); signOut(); } }).catch(function(){}); }
  if(!u){hpShowHome();app.classList.add('hidden');app.classList.remove('flex');return}
  hpHideHome();authScreen.classList.add('hidden');app.classList.remove('hidden');app.classList.add('flex');
  userAvatar.textContent=initials(u.companyName||u.name||u.email);userAvatar.title=(u.companyName||'')+' · '+(u.email||'');
  
  // Display right sidebar once logged in
  document.getElementById('rightSidebar')?.classList.remove('hidden');
  
  renderNav(); renderView(); pullAll();
}
boot();
