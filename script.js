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
      var ADDON = { crm: 'Acacia CRM', budget: 'Acacia Budget', projects: 'Acacia Projects', payroll: 'Acacia Payroll', sell: 'Acacia Sell' };
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

  /* ---- data sync (one JSON blob per company per app) ----
     Record-level three-way merge + compare-and-swap push, so several people editing the same company at once do not overwrite each other.
       base = the copy last agreed with the cloud (acx_base_*), local = this browser's copy, remote = the cloud's copy.
     - records (arrays of objects that have an id) are merged one by one; a record edited on one side and deleted on the other is kept
     - a field changed on both sides keeps this browser's value; counters (next..., ...number) keep the larger value
     - a push only succeeds if the cloud copy is still the one we merged with (updated_at must match); otherwise we merge again */
  var syncTimer = 0, syncBusy = false, pendingRender = false, hookReload = null, hookRender = null;
  function tsKey(c) { return 'acx_ts_' + cfg.app + '_' + (c || ctx.companyId); }
  function dirtyKey(c) { return 'acx_dirty_' + cfg.app + '_' + (c || ctx.companyId); }
  function baseKey(c) { return 'acx_base_' + cfg.app + '_' + (c || ctx.companyId); }

  /*MERGE-START*/
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function same(a, b) { return canon(a) === canon(b); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function idKeyFor(arrs) {
    var cands = ['id', '_id', 'uid'];
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var ok = arrs.every(function (a) {
        var seen = {};
        return a.every(function (x) {
          if (!isObj(x) || x[c] == null || x[c] === '') return false;
          var k = String(x[c]); if (seen[k]) return false; seen[k] = 1; return true;
        });
      });
      if (ok) return c;
    }
    return null;
  }
  function mergeArr(b, l, r) {
    var k = idKeyFor([b, l, r]), out = [], seen = {};
    if (k) {
      var mb = {}, ml = {}, mr = {};
      b.forEach(function (x) { mb[x[k]] = x; }); l.forEach(function (x) { ml[x[k]] = x; }); r.forEach(function (x) { mr[x[k]] = x; });
      var take = function (id) {
        if (seen[id]) return; seen[id] = 1;
        var inB = id in mb, inL = id in ml, inR = id in mr;
        if (inL && inR) out.push(merge3(mb[id], ml[id], mr[id]));
        else if (inL) { if (!inB || !same(mb[id], ml[id])) out.push(ml[id]); }
        else if (inR) { if (!inB || !same(mb[id], mr[id])) out.push(mr[id]); }
      };
      r.forEach(function (x) { take(x[k]); }); l.forEach(function (x) { take(x[k]); });
      return out;
    }
    /* no ids: treat the array as a set of values */
    var sb = {}, sl = {}, sr = {};
    b.forEach(function (x) { sb[canon(x)] = 1; }); l.forEach(function (x) { sl[canon(x)] = 1; }); r.forEach(function (x) { sr[canon(x)] = 1; });
    var add = function (x) {
      var c = canon(x); if (seen[c]) return; seen[c] = 1;
      var inB = c in sb, inL = c in sl, inR = c in sr;
      if ((inL && inR) || (inL && !inB) || (inR && !inB)) out.push(x);
    };
    r.forEach(add); l.forEach(add);
    return out;
  }
  function merge3(b, l, r, name) {
    if (same(l, r)) return l;
    if (same(b, l)) return r;
    if (same(b, r)) return l;
    if (Array.isArray(l) && Array.isArray(r)) return mergeArr(Array.isArray(b) ? b : [], l, r);
    if (isObj(l) && isObj(r)) {
      var bb = isObj(b) ? b : {}, out = {}, keys = {};
      [l, r, bb].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = 1; }); });
      Object.keys(keys).forEach(function (k) {
        var inB = k in bb, inL = k in l, inR = k in r;
        if (inL && inR) out[k] = merge3(bb[k], l[k], r[k], k);
        else if (inL) { if (!inB || !same(bb[k], l[k])) out[k] = l[k]; }
        else if (inR) { if (!inB || !same(bb[k], r[k])) out[k] = r[k]; }
      });
      return out;
    }
    if (typeof l === 'number' && typeof r === 'number' && /^(next|counter|seq)|(number|counter|seq)$/i.test(name || '')) return Math.max(l, r);
    return l;
  }
  function mergeValue(baseStr, localStr, remoteStr) {
    var p = function (s) { try { return JSON.parse(s); } catch (e) { return undefined; } };
    var l = p(localStr), r = p(remoteStr);
    if (l === undefined) return remoteStr;
    if (r === undefined) return localStr;
    return JSON.stringify(merge3(baseStr == null ? undefined : p(baseStr), l, r));
  }
  /*MERGE-END*/

  async function getRow() {
    var r = await req('acacia_app_data?select=value,updated_at&key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(cfg.app));
    if (!r.ok) throw err('offline', 'Could not read data (' + r.status + ')');
    var j = await r.json(), row = j[0] || null;
    if (row && typeof row.value !== 'string') row.value = JSON.stringify(row.value);
    return row;
  }
  /* compare-and-swap write: succeeds only if the cloud copy still has updated_at = prevTs (or does not exist yet when prevTs is empty) */
  async function casPush(v, prevTs) {
    var now = new Date().toISOString(), r, j;
    try {
      if (!prevTs) {
        r = await req('acacia_app_data', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v, updated_at: now }) });
        if (r.status === 409) return 'conflict';
      } else {
        r = await req('acacia_app_data?key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(cfg.app) + '&updated_at=eq.' + enc(prevTs), { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }), body: JSON.stringify({ value: v, updated_at: now }) });
      }
      if (!r.ok) return 'error';
      j = await r.json();
      if (!j[0]) return 'conflict';
      return { ts: j[0].updated_at };
    } catch (e) { return 'error'; }
  }
  function commit(v, ts) {
    rawSet.call(localStorage, tsKey(), ts || '');
    rawSet.call(localStorage, baseKey(), v);
    localStorage.removeItem(dirtyKey());
  }
  async function syncNow() {
    if (!ctx || !isCloudId(ctx.companyId) || syncBusy) return false;
    syncBusy = true;
    var changed = false;
    try {
      for (var n = 0; n < 4; n++) {
        var dk = cfg.dataKey(ctx.companyId), local = localStorage.getItem(dk), res, row = await getRow();
        var last = localStorage.getItem(tsKey()), dirty = localStorage.getItem(dirtyKey()) === '1';
        if (!row) {
          if (local == null) break;
          res = await casPush(local, null);
          if (res === 'conflict') continue;
          if (res === 'error') break;
          if (localStorage.getItem(dk) === local) commit(local, res.ts);
          break;
        }
        if (row.updated_at === last) {                       /* cloud unchanged since our last sync */
          if (!dirty || local == null) break;
          if (local === row.value) { commit(local, row.updated_at); break; }
          res = await casPush(local, row.updated_at);
          if (res === 'conflict') continue;
          if (res === 'error') break;
          if (localStorage.getItem(dk) === local) commit(local, res.ts);
          break;
        }
        if (!dirty || local == null) {                       /* cloud moved on, nothing of ours to keep: take the cloud copy */
          rawSet.call(localStorage, dk, row.value); commit(row.value, row.updated_at); changed = true; break;
        }
        var merged = mergeValue(localStorage.getItem(baseKey()), local, row.value);
        if (merged === row.value) {
          if (localStorage.getItem(dk) === local) { rawSet.call(localStorage, dk, merged); commit(merged, row.updated_at); changed = true; }
          break;
        }
        res = await casPush(merged, row.updated_at);
        if (res === 'conflict') continue;
        if (localStorage.getItem(dk) !== local) break;       /* edited while we were saving: leave it, the next sync merges it in */
        rawSet.call(localStorage, dk, merged); changed = true;
        if (res === 'error') { rawSet.call(localStorage, baseKey(), row.value); break; }
        commit(merged, res.ts);
        break;
      }
    } catch (e) {}
    syncBusy = false;
    if (changed) applyRemote();
    return changed;
  }
  function schedule() {
    if (!ctx || !isCloudId(ctx.companyId)) return;
    rawSet.call(localStorage, dirtyKey(), '1');
    clearTimeout(timer); timer = setTimeout(function () { syncNow(); }, 2500);
  }
  /* page closing: one last compare-and-swap write; it only goes through if nobody else saved since our last sync (otherwise it stays unsaved and is merged next time) */
  function flush() {
    if (!ctx || !isCloudId(ctx.companyId) || localStorage.getItem(dirtyKey()) !== '1') return;
    clearTimeout(timer);
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)), last = localStorage.getItem(tsKey());
    if (v == null || !last) return;
    var dk = dirtyKey();
    try {
      fetch(URL_ + '/rest/v1/acacia_app_data?key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(cfg.app) + '&updated_at=eq.' + enc(last), { method: 'PATCH', keepalive: v.length < 60000, headers: Object.assign({}, H, { Prefer: 'return=representation' }), body: JSON.stringify({ value: v, updated_at: new Date().toISOString() }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.length) localStorage.removeItem(dk); })
        .catch(function () {});
    } catch (e) {}
  }
  async function pullData() { await syncNow(); }

  /* the app registers two callbacks: reload (re-read its in-memory data from storage) and render (redraw the current screen) */
  function onRemote(reload, render) { hookReload = reload; hookRender = render; }
  function typing() {
    var a = document.activeElement;
    return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable) && a.type !== 'button' && a.type !== 'checkbox' && a.type !== 'radio';
  }
  function paint() {
    if (!pendingRender || typing()) return;
    pendingRender = false;
    try { if (hookRender) hookRender(); } catch (e) { console.error(e); }
  }
  function applyRemote() {
    try { if (hookReload) hookReload(); } catch (e) { console.error(e); }
    pendingRender = true; paint();
  }
  function startPoll() { clearInterval(syncTimer); syncTimer = setInterval(function () { if (document.hidden) return; paint(); syncNow(); }, 30000); }
  function stopPoll() { clearInterval(syncTimer); syncTimer = 0; }

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
    startPoll(); heartbeat(); clearInterval(hbTimer); hbTimer = setInterval(function () { heartbeat(); }, 3e5);
    return 'ok';
  }
  function stop() { flush(); stopPoll(); clearInterval(hbTimer); ctx = null; }

  function init(c) {
    cfg = c;
    Storage.prototype.setItem = function (k, v) {
      rawSet.apply(this, arguments);
      try { if (this === w.localStorage && ctx && k === cfg.dataKey(ctx.companyId)) schedule(); } catch (e) {}
    };
    w.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); else syncNow(); });
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

  w.AcaciaCloud = { onRemote: onRemote, sync: syncNow, init: init, signIn: signIn, register: register, addUser: addUser, setRole: setRole, removeUser: removeUser, cacheUser: cacheUser, verifyLocal: verifyLocal, migrate: migrate, start: start, stop: stop, flush: flush, isCloudId: isCloudId, gate: gate, URL: URL_, KEY: KEY_, rpc: rpc, req: req };
})(window);
;
/* =========================================================
   ACACIA PROJECTS — data model & state
;
/* =========================================================
   ACACIA BUDGET — data model & state
========================================================= */
const STORAGE_KEY = 'acaciaBudgetData_v1';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const BUDGET_TYPES = ['Annual','Monthly','Quarterly'];
const PERIODS = ['Full year','Q1','Q2','Q3','Q4'].concat(MONTHS);
const BUDGET_STATUSES = ['Draft','Pending Approval','Approved','Rejected','Closed'];

const DEFAULT_SETTINGS = {
  company: { name:'', address:'', phone:'', email:'', currency:'KES' },
  departments: ['Administration','Finance','Operations','Sales & Marketing','IT'],
  projectNames: [],
  accounts: ['Salaries & Wages','Materials','Equipment','Travel','Marketing','Utilities','Professional Fees','Other'],
  budgetNumberingPrefix: 'BUD-',
  nextBudgetNumber: 1,
  openingCash: 0
};
const DEFAULT_CATEGORIES = [['Sales Revenue','Income'],['Other Income','Income'],['Salaries & Wages','Expense'],['Materials & Supplies','Expense'],['Marketing','Expense'],['Utilities','Expense'],['Travel','Expense'],['Professional Fees','Expense'],['Equipment','Expense']];

function freshState(){
  return {
    budgets: [],
    categories: DEFAULT_CATEGORIES.map(([name,type])=>({id:uid('categories'), name, type, description:'', createdAt:todayISO()})),
    allocations: [], revisions: [], transfers: [], limits: [],
    commitments: [], expenses: [], forecasts: [], approvalLog: [],
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  };
}
let state = null;
function dataKeyFor(companyId){ return STORAGE_KEY + '_' + companyId; }
function loadState(companyId){
  try{
    const raw = localStorage.getItem(dataKeyFor(companyId));
    if(!raw) return freshState();
    const parsed = JSON.parse(raw), base = freshState();
    return Object.assign(base, parsed, { settings: Object.assign(base.settings, parsed.settings||{}) });
  }catch(e){ return freshState(); }
}
function saveState(){
  if(!CURRENT_USER) return;
  localStorage.setItem(dataKeyFor(CURRENT_USER.companyId), JSON.stringify(state));
}

/* ---------- Auth (shared login with Acacia Books apps) ---------- */
const USERS_KEY = 'acaciaCrmUsers';
const SESSION_KEY = 'acaciaCrmSession';
let CURRENT_USER = null;

AcaciaCloud.init({app:'Budget', dataKey:dataKeyFor});
AcaciaCloud.onRemote(function(){ if(!CURRENT_USER) return; state = loadState(CURRENT_USER.companyId); if(!state.settings.company.name) state.settings.company.name = CURRENT_USER.company; }, function(){ if(!CURRENT_USER) return; render(); });
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
  route = {section:'budgetOverview', params:{}};
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


/* ---------- helpers ---------- */
function uid(prefix){ return prefix + '_' + Math.random().toString(36).slice(2,9); }
function esc(str){
  if(str===undefined||str===null) return '';
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtMoney(n){ n = Number(n)||0; return state.settings.company.currency + ' ' + n.toLocaleString('en-KE',{maximumFractionDigits:0}); }
function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d+'T00:00:00'); if(isNaN(dt)) return d;
  return dt.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function toast(msg){
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h); toast._h = setTimeout(()=>t.classList.remove('show'), 2600);
}
const low = s => String(s==null?'':s).trim().toLowerCase();
const sum = (arr,f) => arr.reduce((t,x)=>t+(Number(f(x))||0),0);
const pct = (a,b) => b>0 ? a/b*100 : 0;
const curYear = () => new Date().getFullYear();
const byId = (list,id) => (state[list]||[]).find(x=>x.id===id);
const budgetName = id => { const b=byId('budgets',id); return b ? b.name : '—'; };
const catName = id => { const c=byId('categories',id); return c ? c.name : '—'; };
const allocLabel = a => a ? a.kind+': '+a.target : '—';

/* ---------- budget maths ---------- */
const spentOfBudget = id => sum(state.expenses.filter(e=>e.budgetId===id), e=>e.amount);
const committedOfBudget = id => sum(state.commitments.filter(c=>c.budgetId===id && c.status==='Open'), c=>c.amount);
const spentOfAlloc = id => sum(state.expenses.filter(e=>e.allocationId===id), e=>e.amount);
const committedOfAlloc = id => sum(state.commitments.filter(c=>c.allocationId===id && c.status==='Open'), c=>c.amount);
function usageStatus(p){ return p>100 ? 'Over budget' : p>=80 ? 'Near limit' : 'On track'; }
function usageColor(p){ return p>100 ? '#ef4444' : p>=80 ? '#f59e0b' : '#1f8a2e'; }
function budgetStats(b){
  const amount = Number(b.amount)||0, spent = spentOfBudget(b.id), committed = committedOfBudget(b.id);
  return {amount, spent, committed, available: amount-spent-committed, variance: amount-spent, used: pct(spent+committed, amount), usedActual: pct(spent, amount)};
}
function allocStats(a){
  const amount = Number(a.amount)||0, spent = spentOfAlloc(a.id), committed = committedOfAlloc(a.id);
  return {amount, spent, committed, available: amount-spent-committed, variance: amount-spent, used: pct(spent+committed, amount)};
}
const approvedBudgets = () => state.budgets.filter(b=>b.status==='Approved');

/* ---------- spending-limit checks (Budget Control > Spending Limits) ---------- */
function periodMatch(period, d1, d2){
  const a = new Date((d1||todayISO())+'T00:00:00'), b = new Date((d2||todayISO())+'T00:00:00');
  if(a.getFullYear()!==b.getFullYear()) return false;
  if(period==='Annual') return true;
  if(period==='Quarterly') return Math.floor(a.getMonth()/3)===Math.floor(b.getMonth()/3);
  return a.getMonth()===b.getMonth();
}
function limitPredicate(l){
  const t = low(l.target);
  return r => {
    const al = byId('allocations', r.allocationId);
    if(l.scope==='Budget') return low(budgetName(r.budgetId))===t;
    if(l.scope==='Category') return low(catName(r.categoryId))===t;
    return !!al && al.kind===l.scope && low(al.target)===t;
  };
}
function checkLimits(d, selfId){
  const out = {block:[], warn:[]}, amt = Number(d.amount)||0;
  state.limits.filter(l=>l.active!=='No').forEach(l=>{
    const match = limitPredicate(l); if(!match(d)) return;
    const pool = state.expenses.concat(state.commitments.filter(c=>c.status==='Open'))
      .filter(r=>r.id!==selfId && match(r) && periodMatch(l.period, r.date, d.date));
    const total = sum(pool, r=>r.amount) + amt, cap = Number(l.limitAmount)||0;
    if(total>cap){
      const msg = `Spending limit reached for ${l.scope.toLowerCase()} "${l.target}" (${l.period.toLowerCase()} limit ${fmtMoney(cap)}, would reach ${fmtMoney(total)}).`;
      (l.action==='Block' ? out.block : out.warn).push(msg);
    }
  });
  return out;
}
let pendingWarn = null;
function spendValidate(d, selfId){
  const b = byId('budgets', d.budgetId);
  if(!b) return 'Choose a budget.';
  if(b.status!=='Approved') return 'This budget is "'+b.status+'". Only approved budgets can be spent against.';
  if(d.allocationId){ const a = byId('allocations', d.allocationId); if(!a || a.budgetId!==d.budgetId) return 'That allocation belongs to a different budget.'; }
  const r = checkLimits(d, selfId);
  if(r.block.length) return r.block[0];
  const st = budgetStats(b), extra = Number(d.amount)||0;
  const warn = r.warn.slice();
  if(st.spent+st.committed+extra > st.amount) warn.push('This takes "'+b.name+'" over its budget of '+fmtMoney(st.amount)+'.');
  pendingWarn = warn.length ? warn[0] : null;
  return null;
}

/* ---------- entity schemas ---------- */
const budgetOpts = approvedOnly => () => state.budgets.filter(b=>!approvedOnly||b.status==='Approved').map(b=>({value:b.id,label:b.code+' · '+b.name}));
const catOpts = type => () => { const t = type || (modalCtx&&modalCtx.record&&modalCtx.record.type); return state.categories.filter(c=>!t||c.type===t).map(c=>({value:c.id,label:c.name})); };
const allocOpts = () => state.allocations.map(a=>({value:a.id,label:allocLabel(a)+' ('+budgetName(a.budgetId)+')'}));
const targetOpts = () => { const k = modalCtx&&modalCtx.record&&modalCtx.record.kind, s = state.settings; return k==='Department' ? s.departments : k==='Project' ? s.projectNames : s.accounts; };

const ENTITIES = {
  budgets: {
    label:'Budget', labelPlural:'Budgets',
    defaults: ()=>({status:'Draft', year:curYear(), type:'Annual'}),
    fields: [
      {key:'name', label:'Budget Name', type:'text', required:true},
      {key:'type', label:'Budget Type', type:'select', options:BUDGET_TYPES, required:true},
      {key:'year', label:'Fiscal Year', type:'number', required:true},
      {key:'period', label:'Period (Q1–Q4 or month; Annual = Full year)', type:'select', options:PERIODS},
      {key:'categoryId', label:'Budget Category', type:'select', options:catOpts()},
      {key:'amount', label:'Budget Amount', type:'number', required:true, min:0},
      {key:'owner', label:'Budget Owner', type:'text'},
      {key:'status', label:'Status', type:'select', options:BUDGET_STATUSES},
      {key:'notes', label:'Notes', type:'textarea'}
    ],
    columns: ['code','name','type','period','year','categoryId','amount','used','status','flow'],
    beforeSave(d){
      const s = state.settings;
      if(!d.code){ d.code = s.budgetNumberingPrefix + String(s.nextBudgetNumber++).padStart(4,'0'); }
      if(d.type==='Annual') d.period = 'Full year';
      else if(d.type==='Quarterly' && !/^Q[1-4]$/.test(d.period)) d.period = 'Q1';
      else if(d.type==='Monthly' && MONTHS.indexOf(d.period)<0) d.period = MONTHS[new Date().getMonth()];
      d.amount = Number(d.amount)||0; d.year = Number(d.year)||curYear();
      if(!d.status) d.status = 'Draft';
    },
    validate(d){ if((Number(d.amount)||0)<0) return 'Budget amount cannot be negative.'; }
  },
  categories: {
    label:'Category', labelPlural:'Categories',
    defaults: ()=>({type:'Expense'}),
    fields: [
      {key:'name', label:'Category Name', type:'text', required:true},
      {key:'type', label:'Type', type:'select', options:['Expense','Income'], required:true},
      {key:'description', label:'Description', type:'textarea'}
    ],
    columns: ['name','type','description','budgetCount'],
    validate(d, id){ if(state.categories.some(c=>c.id!==id && low(c.name)===low(d.name))) return 'A category with that name already exists.'; }
  },
  allocations: {
    label:'Allocation', labelPlural:'Allocations',
    fields: [
      {key:'budgetId', label:'Budget', type:'select', options:budgetOpts(false), required:true},
      {key:'target', label:'Allocated To', type:'combo', options:targetOpts, required:true, placeholder:'Pick or type a name'},
      {key:'categoryId', label:'Category', type:'select', options:catOpts('Expense')},
      {key:'amount', label:'Allocated Amount', type:'number', required:true, min:0},
      {key:'notes', label:'Notes', type:'textarea'}
    ],
    columns: ['target','budgetId','categoryId','amount','spent','committed','remaining','used'],
    validate(d, id){
      const b = byId('budgets', d.budgetId); if(!b) return 'Choose a budget.';
      const others = sum(state.allocations.filter(a=>a.id!==id && a.budgetId===d.budgetId && a.kind===d.kind), a=>a.amount);
      if(others + (Number(d.amount)||0) > (Number(b.amount)||0)) return d.kind+' allocations would exceed the budget total of '+fmtMoney(b.amount)+' (already allocated: '+fmtMoney(others)+').';
    }
  },
  revisions: {
    label:'Revision', labelPlural:'Revisions',
    defaults: ()=>({status:'Pending', date:todayISO()}),
    fields: [
      {key:'budgetId', label:'Budget', type:'select', options:budgetOpts(false), required:true},
      {key:'date', label:'Date', type:'date'},
      {key:'newAmount', label:'Revised Amount', type:'number', required:true, min:0},
      {key:'reason', label:'Reason for Revision', type:'textarea', required:true}
    ],
    columns: ['date','budgetId','oldAmount','newAmount','change','reason','status','flow'],
    beforeSave(d){ const b = byId('budgets', d.budgetId); if(b && !d.id && d.oldAmount===undefined) d.oldAmount = Number(b.amount)||0; if(!d.status) d.status='Pending'; d.newAmount = Number(d.newAmount)||0; }
  },
  transfers: {
    label:'Transfer', labelPlural:'Transfers',
    defaults: ()=>({status:'Pending', date:todayISO()}),
    fields: [
      {key:'fromAllocId', label:'From Allocation', type:'select', options:allocOpts, required:true},
      {key:'toAllocId', label:'To Allocation', type:'select', options:allocOpts, required:true},
      {key:'amount', label:'Amount', type:'number', required:true, min:0},
      {key:'date', label:'Date', type:'date'},
      {key:'reason', label:'Reason', type:'textarea'}
    ],
    columns: ['date','fromAllocId','toAllocId','amount','reason','status','flow'],
    beforeSave(d){ if(!d.status) d.status='Pending'; d.amount = Number(d.amount)||0; },
    validate(d){
      if(d.fromAllocId===d.toAllocId) return 'Choose two different allocations.';
      const f = byId('allocations', d.fromAllocId); if(f && (Number(d.amount)||0) > allocStats(f).available) return 'The source allocation only has '+fmtMoney(allocStats(f).available)+' available.';
    }
  },
  limits: {
    label:'Spending Limit', labelPlural:'Spending Limits',
    defaults: ()=>({scope:'Category', period:'Monthly', action:'Warn', active:'Yes'}),
    fields: [
      {key:'scope', label:'Applies To', type:'select', options:['Category','Budget','Department','Project','Account'], required:true},
      {key:'target', label:'Name (category, budget, department, project or account)', type:'text', required:true},
      {key:'limitAmount', label:'Limit Amount', type:'number', required:true, min:0},
      {key:'period', label:'Limit Period', type:'select', options:['Monthly','Quarterly','Annual'], required:true},
      {key:'action', label:'When Exceeded', type:'select', options:['Warn','Block'], required:true},
      {key:'active', label:'Active', type:'select', options:['Yes','No']}
    ],
    columns: ['scope','target','limitAmount','period','action','active','usage']
  },
  commitments: {
    label:'Commitment', labelPlural:'Commitments',
    defaults: ()=>({status:'Open', date:todayISO()}),
    fields: [
      {key:'date', label:'Date', type:'date', required:true},
      {key:'reference', label:'Reference (PO / contract no.)', type:'text', required:true},
      {key:'vendor', label:'Vendor / Supplier', type:'text'},
      {key:'budgetId', label:'Budget', type:'select', options:budgetOpts(true), required:true},
      {key:'allocationId', label:'Allocation (optional)', type:'select', options:allocOpts},
      {key:'categoryId', label:'Category', type:'select', options:catOpts('Expense')},
      {key:'amount', label:'Committed Amount', type:'number', required:true, min:0},
      {key:'status', label:'Status', type:'select', options:['Open','Invoiced','Released']},
      {key:'notes', label:'Notes', type:'textarea'}
    ],
    columns: ['date','reference','vendor','budgetId','allocationId','amount','status','flow'],
    validate(d,id){ return d.status==='Open' ? spendValidate(d,id) : null; }
  },
  expenses: {
    label:'Expense', labelPlural:'Expenses',
    defaults: ()=>({date:todayISO()}),
    fields: [
      {key:'date', label:'Date', type:'date', required:true},
      {key:'description', label:'Description', type:'text', required:true},
      {key:'vendor', label:'Vendor / Payee', type:'text'},
      {key:'budgetId', label:'Budget', type:'select', options:budgetOpts(true), required:true},
      {key:'allocationId', label:'Allocation (optional)', type:'select', options:allocOpts},
      {key:'categoryId', label:'Category', type:'select', options:catOpts('Expense')},
      {key:'amount', label:'Amount Spent', type:'number', required:true, min:0}
    ],
    columns: ['date','description','vendor','budgetId','allocationId','categoryId','amount'],
    validate(d,id){ return spendValidate(d,id); }
  },
  forecasts: {
    label:'Forecast', labelPlural:'Forecasts',
    defaults: ()=>({year:curYear(), month:MONTHS[new Date().getMonth()]}),
    fields: [
      {key:'year', label:'Year', type:'number', required:true},
      {key:'month', label:'Month', type:'select', options:MONTHS, required:true},
      {key:'categoryId', label:'Category', type:'select', options:catOpts()},
      {key:'amount', label:'Forecast Amount', type:'number', required:true, min:0},
      {key:'notes', label:'Notes', type:'textarea'}
    ],
    columns: ['year','month','categoryId','amount','notes'],
    beforeSave(d){ d.year = Number(d.year)||curYear(); d.amount = Number(d.amount)||0; }
  }
};

/* ---------- navigation ---------- */
const NAV_GROUPS = [
  {key:'dash', label:'Budget Dashboard', items:[['budgetOverview','Budget Overview'],['budgetUtilization','Budget Utilization'],['spendingSummary','Spending Summary']]},
  {key:'mgmt', label:'Budget Management', items:[['createBudget','Create Budget'],['annualBudgets','Annual Budgets'],['monthlyBudgets','Monthly Budgets'],['quarterlyBudgets','Quarterly Budgets'],['budgetCategories','Budget Categories']]},
  {key:'alloc', label:'Budget Allocations', items:[['accountAllocations','Account Allocations'],['departmentAllocations','Department Allocations'],['projectAllocations','Project Allocations']]},
  {key:'ctrl', label:'Budget Control', items:[['budgetApprovals','Budget Approvals'],['budgetRevisions','Budget Revisions'],['budgetTransfers','Budget Transfers'],['spendingLimits','Spending Limits'],['committedExpenditure','Committed Expenditure']]},
  {key:'fcst', label:'Forecasting', items:[['incomeForecast','Income Forecast'],['expenseForecast','Expense Forecast'],['cashFlowForecast','Cash Flow Forecast']]},
  {key:'rpts', label:'Budget Reports', items:[['rptBudgetVsActual','Budget vs Actual'],['rptBudgetVariance','Budget Variance'],['rptUtilization','Budget Utilization Report'],['rptDepartment','Departmental Budget Report'],['rptProject','Project Budget Report']]}
];
const NAV = [].concat(...NAV_GROUPS.map(g=>g.items.map(([key,label])=>({key,label,group:g.key})))).concat([{key:'settings',label:'Settings'}]);
const navLabel = key => (NAV.find(n=>n.key===key)||{}).label || key;
const groupOf = key => (NAV.find(n=>n.key===key)||{}).group;
let navOpen = {};
let route = {section:'budgetOverview', params:{}};

function renderNav(){
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV_GROUPS.map((g,n)=>`<div class="nav-group">
      <div class="nav-gh"><span>${n+1}. ${esc(g.label)}</span></div>
      <div class="nav-gb">${g.items.map(([k,l])=>`<div class="nav-item ${route.section===k?'active':''}" onclick="goTo('${k}')"><span class="dot"></span>${esc(l)}</div>`).join('')}</div>
    </div>`).join('') + `<div class="nav-group"><div class="nav-item ${route.section==='settings'?'active':''}" onclick="goTo('settings')"><span class="dot"></span>Settings</div></div>`;
}
function goTo(section, params){
  route = {section, params: params||{}};
  renderNav(); render();
  const m = document.querySelector('.main'); if(m) m.scrollTop = 0;
}

/* ---------- generic modal ---------- */
let modalCtx = null;
function openEntityModal(entityKey, recordId, preset){
  const schema = ENTITIES[entityKey];
  const rec = recordId ? state[entityKey].find(r=>r.id===recordId) : Object.assign({}, schema.defaults ? schema.defaults() : {}, preset||{});
  modalCtx = {entityKey, recordId, record: Object.assign({}, rec)};
  document.getElementById('modalTitle').textContent = (recordId?'Edit ':'New ') + schema.label;
  document.getElementById('modalBody').innerHTML = schema.fields.map(f=>renderField(f, modalCtx.record)).join('');
  const sb = document.getElementById('modalSaveBtn'); sb.onclick = saveEntityModal; sb.style.display = '';
  document.getElementById('modalOverlay').classList.add('open');
}
function plainValue(entityKey, f, rec){
  const v = rec[f.key]; if(v===undefined || v===null || v==='') return '—';
  const m = {budgetId:budgetName, categoryId:catName};
  if(m[f.key]) return m[f.key](v);
  if(f.key==='allocationId'||f.key==='fromAllocId'||f.key==='toAllocId') return allocLabel(byId('allocations',v));
  if(f.type==='date') return fmtDate(v);
  if(/amount/i.test(f.key)) return fmtMoney(v);
  return v;
}
function previewRecord(entityKey, id){
  const schema = ENTITIES[entityKey], rec = state[entityKey].find(r=>r.id===id); if(!rec) return;
  modalCtx = null;
  document.getElementById('modalTitle').textContent = 'Preview ' + schema.label;
  document.getElementById('modalBody').innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px 18px">' +
    schema.fields.map(f=>`<div style="${f.type==='textarea'?'grid-column:1/-1;':''}"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin-bottom:2px">${esc(f.label)}</div><div style="white-space:pre-wrap">${esc(plainValue(entityKey,f,rec))}</div></div>`).join('') + '</div>';
  document.getElementById('modalSaveBtn').style.display = 'none';
  document.getElementById('modalOverlay').classList.add('open');
}
function cloneRecord(entityKey, id){
  const schema = ENTITIES[entityKey], rec = state[entityKey].find(r=>r.id===id); if(!rec) return;
  const copy = JSON.parse(JSON.stringify(rec));
  copy.id = uid(entityKey); copy.createdAt = todayISO();
  if(entityKey==='budgets'){ copy.name += ' (Copy)'; copy.code = ''; copy.status = 'Draft'; }
  else if(typeof copy.name==='string') copy.name += ' (Copy)';
  if(entityKey==='revisions'||entityKey==='transfers'||entityKey==='commitments') copy.status = entityKey==='commitments' ? 'Open' : 'Pending';
  if(schema.beforeSave) schema.beforeSave(copy);
  if(entityKey==='expenses'||entityKey==='commitments'){ const err = schema.validate(copy, null); if(err){ toast(err); return; } }
  state[entityKey].push(copy); saveState(); toast(schema.label+' cloned.'); render();
}
function renderField(f, record){
  const val = record[f.key]!==undefined ? record[f.key] : '', id = 'f_'+f.key;
  const opts = () => (typeof f.options==='function' ? f.options() : (f.options||[])).map(o=>typeof o==='string'?{value:o,label:o}:o);
  if(f.type==='select') return `<div class="field"><label>${esc(f.label)}${f.required?' *':''}</label><select id="${id}" data-key="${f.key}"><option value="">— Select —</option>${opts().map(o=>`<option value="${esc(o.value)}" ${String(val)===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></div>`;
  if(f.type==='combo') return `<div class="field"><label>${esc(f.label)}${f.required?' *':''}</label><input id="${id}" data-key="${f.key}" list="dl_${f.key}" value="${esc(val)}" placeholder="${esc(f.placeholder||'')}"><datalist id="dl_${f.key}">${opts().map(o=>`<option value="${esc(o.value)}">`).join('')}</datalist></div>`;
  if(f.type==='textarea') return `<div class="field"><label>${esc(f.label)}</label><textarea id="${id}" data-key="${f.key}" placeholder="${esc(f.placeholder||'')}">${esc(val)}</textarea></div>`;
  return `<div class="field"><label>${esc(f.label)}${f.required?' *':''}</label><input id="${id}" data-key="${f.key}" type="${f.type}" value="${esc(val)}" placeholder="${esc(f.placeholder||'')}" ${f.min!==undefined?`min="${f.min}"`:''}></div>`;
}
/* validates, normalises and stores one record; returns true when saved */
function commitRecord(entityKey, draft, recordId){
  const schema = ENTITIES[entityKey];
  if(schema.fields.some(f=>f.required && (draft[f.key]===undefined||draft[f.key]===''))){ toast('Please fill the required fields.'); return false; }
  pendingWarn = null;
  const err = schema.validate && schema.validate(draft, recordId);
  if(err){ toast(err); return false; }
  if(schema.beforeSave) schema.beforeSave(draft);
  if(entityKey==='expenses' && draft.allocationId && !draft.categoryId){ const a = byId('allocations',draft.allocationId); if(a) draft.categoryId = a.categoryId||''; }
  if(recordId){ const i = state[entityKey].findIndex(r=>r.id===recordId); state[entityKey][i] = Object.assign(state[entityKey][i], draft); }
  else { draft.id = uid(entityKey); draft.createdAt = todayISO(); state[entityKey].push(draft); }
  saveState();
  return true;
}
function saveEntityModal(){
  const {entityKey, recordId, record} = modalCtx, draft = Object.assign({}, record);
  document.querySelectorAll('#modalBody [data-key]').forEach(inp=>{ draft[inp.dataset.key] = inp.value; });
  if(!commitRecord(entityKey, draft, recordId)) return;
  const label = ENTITIES[entityKey].label;
  closeModal(); toast(pendingWarn ? label+' saved. Note: '+pendingWarn : label+(recordId?' updated.':' created.')); render();
}
function closeModal(){
  document.getElementById('modalOverlay').classList.remove('open');
  const sb = document.getElementById('modalSaveBtn'); if(sb) sb.style.display = '';
  modalCtx = null;
}
function deleteRecord(entityKey, id){
  const dependents = entityKey==='budgets' ? ['allocations','expenses','commitments','revisions'].filter(k=>state[k].some(r=>r.budgetId===id)) : entityKey==='allocations' ? ['expenses','commitments'].filter(k=>state[k].some(r=>r.allocationId===id)) : [];
  if(dependents.length){ toast('Cannot delete: it is still used by '+dependents.join(', ')+'. Remove those first.'); return; }
  if(!confirm('Delete this '+ENTITIES[entityKey].label.toLowerCase()+'? This cannot be undone.')) return;
  state[entityKey] = state[entityKey].filter(r=>r.id!==id); saveState(); toast(ENTITIES[entityKey].label+' deleted.'); render();
}

/* ---------- generic table ---------- */
const COLUMN_LABELS = {code:'Code', name:'Name', type:'Type', period:'Period', year:'Year', month:'Month', categoryId:'Category', amount:'Amount', used:'% Used', status:'Status', flow:'Action',
  description:'Description', budgetCount:'Budgets', target:'Allocated To', budgetId:'Budget', spent:'Spent', committed:'Committed', remaining:'Remaining', date:'Date', oldAmount:'Current', newAmount:'Revised', change:'Change', reason:'Reason',
  fromAllocId:'From', toAllocId:'To', scope:'Applies To', limitAmount:'Limit', action:'When Exceeded', active:'Active', usage:'Used So Far', reference:'Reference', vendor:'Vendor', allocationId:'Allocation', notes:'Notes'};
const usageBar = p => `<div class="progress-row" style="min-width:110px"><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100,Math.max(0,p))}%;background:${usageColor(p)}"></div></div><span class="pct">${p.toFixed(0)}%</span></div>`;
const flowBtn = (ek,id,dec,label,cls) => `<button class="btn small ${cls||''}" onclick="event.stopPropagation();decide('${ek}','${id}','${dec}')">${label}</button>`;
function cellValue(ek, col, rec){
  const st = ek==='budgets' ? budgetStats(rec) : ek==='allocations' ? allocStats(rec) : null;
  switch(col){
    case 'budgetId': return esc(budgetName(rec.budgetId));
    case 'categoryId': return esc(catName(rec.categoryId));
    case 'allocationId': case 'fromAllocId': case 'toAllocId': return esc(allocLabel(byId('allocations', rec[col])));
    case 'amount': case 'oldAmount': case 'newAmount': case 'limitAmount': return fmtMoney(rec[col]);
    case 'change': { const d = (Number(rec.newAmount)||0)-(Number(rec.oldAmount)||0); return `<span style="color:${d<0?'var(--danger)':'var(--success)'}">${d>0?'+':''}${fmtMoney(d)}</span>`; }
    case 'date': return fmtDate(rec.date);
    case 'status': return `<span class="badge status-${esc((rec.status||'').replace(/ /g,'.'))}">${esc(rec.status||'—')}</span>`;
    case 'used': return st ? usageBar(st.used) : '—';
    case 'spent': return st ? fmtMoney(st.spent) : '—';
    case 'committed': return st ? fmtMoney(st.committed) : '—';
    case 'remaining': return st ? `<span style="color:${st.available<0?'var(--danger)':'var(--success)'}">${fmtMoney(st.available)}</span>` : '—';
    case 'budgetCount': return String(state.budgets.filter(b=>b.categoryId===rec.id).length);
    case 'active': return rec.active==='No' ? 'No' : 'Yes';
    case 'usage': { const m = limitPredicate(rec), pool = state.expenses.concat(state.commitments.filter(c=>c.status==='Open')).filter(r=>m(r) && periodMatch(rec.period, r.date, todayISO())); return usageBar(pct(sum(pool,r=>r.amount), Number(rec.limitAmount)||0)); }
    case 'flow':
      if(ek==='budgets') return rec.status==='Draft'||rec.status==='Rejected' ? flowBtn(ek,rec.id,'Submit','Submit') : rec.status==='Pending Approval' ? flowBtn(ek,rec.id,'Approved','Approve','primary')+' '+flowBtn(ek,rec.id,'Rejected','Reject') : rec.status==='Approved' ? flowBtn(ek,rec.id,'Closed','Close') : '';
      if(ek==='commitments') return rec.status==='Open' ? flowBtn(ek,rec.id,'Invoiced','Invoiced')+' '+flowBtn(ek,rec.id,'Released','Release') : '';
      return rec.status==='Pending' ? flowBtn(ek,rec.id,'Approved','Approve','primary')+' '+flowBtn(ek,rec.id,'Rejected','Reject') : '';
  }
  return esc(rec[col]===undefined||rec[col]==='' ? '—' : rec[col]);
}
function renderEntityTable(ek, records, opts){
  opts = opts||{}; const schema = ENTITIES[ek], cols = opts.columns || schema.columns;
  const preset = opts.preset ? JSON.stringify(opts.preset).replace(/"/g,'&quot;') : 'null';
  if(!records.length) return `<div class="empty-state"><div class="title">No ${schema.labelPlural.toLowerCase()} yet</div><div>${esc(opts.emptyHint||('Create your first '+schema.label.toLowerCase()+' to get started.'))}</div><button class="btn primary" onclick="openEntityModal('${ek}', null, ${preset})">+ New ${schema.label}</button></div>`;
  return `<div style="overflow-x:auto"><table><thead><tr>${cols.map(c=>`<th>${COLUMN_LABELS[c]||c}</th>`).join('')}<th></th></tr></thead><tbody>${records.map(rec=>`<tr>${cols.map(c=>`<td>${cellValue(ek,c,rec)}</td>`).join('')}<td class="row-actions acx-cell">${ACX_ACT({view:`previewRecord('${ek}','${rec.id}')`, edit:`openEntityModal('${ek}','${rec.id}')`, clone:`cloneRecord('${ek}','${rec.id}')`, del:`deleteRecord('${ek}','${rec.id}')`})}</td></tr>`).join('')}</tbody></table></div>`;
}
function setHeader(eyebrow, title, actionsHtml){
  document.getElementById('pageEyebrow').textContent = eyebrow;
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('topActions').innerHTML = actionsHtml || '';
}
const newBtn = (ek, label, preset) => `<button class="btn primary" onclick="openEntityModal('${ek}', null, ${preset?JSON.stringify(preset).replace(/"/g,'&quot;'):'null'})">+ ${label||'New '+ENTITIES[ek].label}</button>`;
const tabsHtml = (items, active, fn) => `<div class="tabs"><div class="tab ${!active?'active':''}" onclick="${fn('')}">All</div>${items.map(s=>`<div class="tab ${String(active)===String(s)?'active':''}" onclick="${fn(s)}">${esc(s)}</div>`).join('')}</div>`;

/* ---------- workflow: approvals, revisions, transfers, commitments ---------- */
function logApproval(kind, ref, decision, note){ state.approvalLog.push({id:uid('log'), date:todayISO(), kind, ref, decision, by:(CURRENT_USER&&CURRENT_USER.name)||'', note:note||''}); }
function decide(ek, id, decision){
  const rec = byId(ek, id); if(!rec) return;
  if(ek==='budgets'){
    if(decision==='Submit'){ rec.status = 'Pending Approval'; logApproval('Budget', rec.code+' '+rec.name, 'Submitted'); toast('Submitted for approval.'); }
    else { rec.status = decision; logApproval('Budget', rec.code+' '+rec.name, decision); toast('Budget '+decision.toLowerCase()+'.'); }
  } else if(ek==='revisions'){
    if(decision==='Approved'){ const b = byId('budgets', rec.budgetId); if(b){ b.amount = Number(rec.newAmount)||0; } }
    rec.status = decision; logApproval('Revision', budgetName(rec.budgetId), decision, rec.reason); toast('Revision '+decision.toLowerCase()+'.');
  } else if(ek==='transfers'){
    if(decision==='Approved'){
      const f = byId('allocations', rec.fromAllocId), t = byId('allocations', rec.toAllocId), a = Number(rec.amount)||0;
      if(!f||!t){ toast('One of the allocations no longer exists.'); return; }
      if(a > allocStats(f).available){ toast('The source allocation only has '+fmtMoney(allocStats(f).available)+' available.'); return; }
      f.amount = (Number(f.amount)||0)-a; t.amount = (Number(t.amount)||0)+a;
    }
    rec.status = decision; logApproval('Transfer', allocLabel(byId('allocations',rec.fromAllocId))+' → '+allocLabel(byId('allocations',rec.toAllocId)), decision, rec.reason); toast('Transfer '+decision.toLowerCase()+'.');
  } else if(ek==='commitments'){ rec.status = decision; toast('Commitment marked '+decision.toLowerCase()+'.'); }
  saveState(); render();
}


/* =========================================================
   Pages
========================================================= */
const SECTION_META = {
  budgetOverview:['Budget Dashboard','Budget Overview'], budgetUtilization:['Budget Dashboard','Budget Utilization'], spendingSummary:['Budget Dashboard','Spending Summary'],
  createBudget:['Budget Management','Create Budget'], annualBudgets:['Budget Management','Annual Budgets'], monthlyBudgets:['Budget Management','Monthly Budgets'], quarterlyBudgets:['Budget Management','Quarterly Budgets'], budgetCategories:['Budget Management','Budget Categories'],
  accountAllocations:['Budget Allocations','Account Allocations'], departmentAllocations:['Budget Allocations','Department Allocations'], projectAllocations:['Budget Allocations','Project Allocations'],
  budgetApprovals:['Budget Control','Budget Approvals'], budgetRevisions:['Budget Control','Budget Revisions'], budgetTransfers:['Budget Control','Budget Transfers'], spendingLimits:['Budget Control','Spending Limits'], committedExpenditure:['Budget Control','Committed Expenditure'],
  incomeForecast:['Forecasting','Income Forecast'], expenseForecast:['Forecasting','Expense Forecast'], cashFlowForecast:['Forecasting','Cash Flow Forecast'],
  rptBudgetVsActual:['Budget Reports','Budget vs Actual'], rptBudgetVariance:['Budget Reports','Budget Variance'], rptUtilization:['Budget Reports','Budget Utilization Report'], rptDepartment:['Budget Reports','Departmental Budget Report'], rptProject:['Budget Reports','Project Budget Report'],
  settings:['Configuration','Settings']
};
function render(){
  const c = document.getElementById('content'), s = route.section, m = SECTION_META[s]; if(!m || !state) return;
  const fn = {
    budgetOverview:renderOverview, budgetUtilization:renderUtilization, spendingSummary:renderSpending,
    createBudget:renderCreateBudget, annualBudgets:c=>renderBudgetList(c,'Annual'), monthlyBudgets:c=>renderBudgetList(c,'Monthly'), quarterlyBudgets:c=>renderBudgetList(c,'Quarterly'), budgetCategories:renderCategories,
    accountAllocations:c=>renderAllocations(c,'Account'), departmentAllocations:c=>renderAllocations(c,'Department'), projectAllocations:c=>renderAllocations(c,'Project'),
    budgetApprovals:renderApprovals, budgetRevisions:c=>renderSimple(c,'revisions','Record a revision to change an approved budget amount. It takes effect when approved.'), budgetTransfers:c=>renderSimple(c,'transfers','Move unspent money from one allocation to another. It takes effect when approved.'),
    spendingLimits:c=>renderSimple(c,'limits','Set limits that warn or block spending on a category, budget, department, project or account.'), committedExpenditure:renderCommitted,
    incomeForecast:c=>renderForecast(c,'Income'), expenseForecast:c=>renderForecast(c,'Expense'), cashFlowForecast:renderCashFlow,
    rptBudgetVsActual:renderRptVsActual, rptBudgetVariance:renderRptVariance, rptUtilization:renderRptUtilization, rptDepartment:c=>renderRptGroup(c,'Department'), rptProject:c=>renderRptGroup(c,'Project'),
    settings:renderSettings
  }[s];
  setHeader(m[0], m[1], '');
  fn(c);
}
const emptyMsg = t => `<div class="adx-empty">${t}</div>`;

/* ---------- 1. Dashboard ---------- */
function renderOverview(c){
  const A = ADX, C = A.C, ap = approvedBudgets();
  const total = sum(ap,b=>b.amount), spent = sum(ap,b=>spentOfBudget(b.id)), comm = sum(ap,b=>committedOfBudget(b.id)), avail = total-spent-comm;
  const pend = state.budgets.filter(b=>b.status==='Pending Approval').length, over = ap.filter(b=>budgetStats(b).used>100);
  const stCount = BUDGET_STATUSES.map(s=>({s, n:state.budgets.filter(b=>b.status===s).length}));
  const colors = {Draft:'#9ca3af','Pending Approval':C.o, Approved:C.g, Rejected:C.r, Closed:C.b};
  const catRows = state.categories.filter(k=>k.type==='Expense').map(k=>{ const bs = ap.filter(b=>b.categoryId===k.id); return {k, amt:sum(bs,b=>b.amount), sp:sum(bs,b=>spentOfBudget(b.id))}; }).filter(r=>r.amt>0);
  setHeader('Budget Dashboard','Budget Overview', `<button class="btn primary" onclick="goTo('createBudget')">+ Create Budget</button>`);
  c.innerHTML = `<div class="adx-wrap">
  <div class="adx-grid adx-g4">
    ${A.kpi({i:'wallet',l:'Approved Budget',v:fmtMoney(total),d:`<div class="adx-d fl">${ap.length} approved of ${state.budgets.length} budgets</div>`})}
    ${A.kpi({i:'cash',c:'b',l:'Spent',v:fmtMoney(spent),d:`<div class="adx-d fl">${pct(spent,total).toFixed(0)}% of budget</div>`})}
    ${A.kpi({i:'clock',c:'o',l:'Committed',v:fmtMoney(comm),d:`<div class="adx-d fl">Open commitments</div>`})}
    ${A.kpi({i:'trend',c:'p',l:'Available',v:fmtMoney(avail),d:`<div class="adx-d ${avail<0?'dn':'fl'}">${pend} awaiting approval</div>`})}
  </div>
  <div class="adx-grid adx-g3">
    ${A.panel('Budgets by Status', state.budgets.length ? A.donut(stCount.filter(x=>x.n).map(x=>({v:x.n,c:colors[x.s],l:x.s})), String(state.budgets.length), 'Budgets') : emptyMsg('Create a budget to see it here.'), {i:'grid'})}
    ${A.panel('Budget vs Spent by Category', catRows.length ? catRows.slice(0,6).map(r=>A.hb(r.k.name, pct(r.sp,r.amt), fmtMoney(r.sp)+' / '+fmtMoney(r.amt), usageColor(pct(r.sp,r.amt)))).join('') : emptyMsg('Approved budgets with a category appear here.'), {i:'trend', link:['Utilization',"goTo('budgetUtilization')"]})}
    ${A.panel('Needs Attention', (pend||over.length||state.revisions.some(r=>r.status==='Pending')||state.transfers.some(r=>r.status==='Pending')) ?
      (pend?A.row('check',`<b>${pend}</b> budget${pend>1?'s':''} awaiting approval`,'',"goTo('budgetApprovals')"):'')+
      over.map(b=>A.row('clock',`<b>${esc(b.name)}</b> is over budget`,Math.round(budgetStats(b).used)+'%',"goTo('budgetUtilization')")).join('')+
      (state.revisions.some(r=>r.status==='Pending')?A.row('check','Revisions waiting for a decision','',"goTo('budgetRevisions')"):'')+
      (state.transfers.some(r=>r.status==='Pending')?A.row('check','Transfers waiting for a decision','',"goTo('budgetTransfers')"):'') : emptyMsg('Nothing needs attention.'), {i:'clock'})}
  </div></div>`;
}
function renderUtilization(c){
  const A = ADX, ap = approvedBudgets(), rows = ap.map(b=>({b, st:budgetStats(b)})).sort((x,y)=>y.st.used-x.st.used);
  const total = sum(ap,b=>b.amount), used = sum(ap,b=>spentOfBudget(b.id)+committedOfBudget(b.id)), p = pct(used,total);
  const buckets = [['On track',rows.filter(r=>r.st.used<80).length,A.C.g],['Near limit',rows.filter(r=>r.st.used>=80&&r.st.used<=100).length,A.C.o],['Over budget',rows.filter(r=>r.st.used>100).length,A.C.r]];
  c.innerHTML = `<div class="adx-wrap"><div class="adx-grid adx-g3">
    ${A.panel('Overall Utilization', rows.length ? A.donut([{v:Math.min(used,total),c:A.C.g,l:'Used (spent + committed)',t:fmtMoney(used)},{v:Math.max(total-used,0),c:A.C.gl,l:'Remaining',t:fmtMoney(Math.max(total-used,0))}], p.toFixed(0)+'%','Used') : emptyMsg('No approved budgets yet.'), {i:'grid'})}
    ${A.panel('Health', rows.length ? buckets.map(([l,n,col])=>A.row('',`<span style="color:${col}">●</span> ${l}`,String(n))).join('') : emptyMsg('No approved budgets yet.'), {i:'check'})}
    ${A.panel('Most Used', rows.slice(0,4).map(r=>A.hb(r.b.name, Math.min(r.st.used,100), r.st.used.toFixed(0)+'%', usageColor(r.st.used))).join('') || emptyMsg('Nothing to show yet.'), {i:'trend'})}
  </div>
  <div class="panel"><div class="panel-head"><h3>Utilization by Budget</h3></div><div class="panel-body">${rows.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Budget</th><th>Period</th><th>Budget</th><th>Spent</th><th>Committed</th><th>Available</th><th>% Used</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.b.name)}</td><td>${esc(r.b.period)} ${r.b.year}</td><td>${fmtMoney(r.st.amount)}</td><td>${fmtMoney(r.st.spent)}</td><td>${fmtMoney(r.st.committed)}</td><td style="color:${r.st.available<0?'var(--danger)':'var(--success)'}">${fmtMoney(r.st.available)}</td><td>${usageBar(r.st.used)}</td><td><span class="badge status-${usageStatus(r.st.used).replace(/ /g,'.')}">${usageStatus(r.st.used)}</span></td></tr>`).join('')}</tbody></table></div>` : emptyMsg('Approve a budget to track its utilization.')}</div></div></div>`;
}
function renderSpending(c){
  const A = ADX, ex = state.expenses, now = new Date(), ym = now.toISOString().slice(0,7), yr = String(now.getFullYear());
  const mSpent = sum(ex.filter(e=>(e.date||'').slice(0,7)===ym),e=>e.amount), ySpent = sum(ex.filter(e=>(e.date||'').slice(0,4)===yr),e=>e.amount);
  const series = A.months(12).map(m=>({l:m.l, v:sum(ex.filter(e=>(e.date||'').slice(0,7)===m.k),e=>e.amount)}));
  const byCat = {}; ex.forEach(e=>{ const k = e.categoryId ? catName(e.categoryId) : 'Uncategorised'; byCat[k] = (byCat[k]||0)+(Number(e.amount)||0); });
  const cats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,6), maxC = cats.length ? cats[0][1] : 1;
  setHeader('Budget Dashboard','Spending Summary', newBtn('expenses','Record Expense'));
  c.innerHTML = `<div class="adx-wrap"><div class="adx-grid adx-g4">
    ${A.kpi({i:'cash',l:'Spent This Month',v:fmtMoney(mSpent)})}
    ${A.kpi({i:'wallet',c:'b',l:'Spent This Year',v:fmtMoney(ySpent)})}
    ${A.kpi({i:'clock',c:'o',l:'Committed (open)',v:fmtMoney(sum(state.commitments.filter(x=>x.status==='Open'),x=>x.amount))})}
    ${A.kpi({i:'trend',c:'p',l:'Expenses Recorded',v:ex.length})}
  </div>
  <div class="adx-grid adx-g2">
    ${A.panel('Spending, Last 12 Months', ex.length ? A.line(series) : emptyMsg('Record an expense to see the trend.'), {i:'trend'})}
    ${A.panel('Spending by Category', cats.length ? cats.map(([k,v])=>A.hb(k, v/maxC*100, fmtMoney(v))).join('') : emptyMsg('No spending yet.'), {i:'grid'})}
  </div>
  <div class="panel"><div class="panel-head"><h3>Recent Expenses</h3></div><div class="panel-body">${renderEntityTable('expenses', [...ex].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,25), {emptyHint:'Spending is recorded against an approved budget.'})}</div></div></div>`;
}

/* ---------- 2. Budget management ---------- */
function renderCreateBudget(c){
  const sch = ENTITIES.budgets, rec = sch.defaults();
  c.innerHTML = `<div class="panel"><div class="panel-head"><h3>New Budget</h3></div><div class="panel-body" id="cbForm">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:4px 18px">${sch.fields.filter(f=>f.key!=='status').map(f=>renderField(f,rec)).join('')}</div>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="createBudgetSubmit('Draft')">Save as Draft</button><button class="btn primary" onclick="createBudgetSubmit('Pending Approval')">Submit for Approval</button></div>
    <div style="font-size:12px;opacity:.7;margin-top:10px">Only approved budgets can be spent against. Annual budgets cover the full year; for Monthly or Quarterly budgets pick the month or quarter.</div></div></div>`;
}
function createBudgetSubmit(status){
  const draft = ENTITIES.budgets.defaults(); draft.status = status;
  document.querySelectorAll('#cbForm [data-key]').forEach(i=>{ draft[i.dataset.key] = i.value; });
  if(!commitRecord('budgets', draft, null)) return;
  logApproval('Budget', draft.code+' '+draft.name, status==='Draft' ? 'Created as draft' : 'Submitted');
  saveState(); toast('Budget '+draft.code+' saved.');
  goTo({Annual:'annualBudgets',Monthly:'monthlyBudgets',Quarterly:'quarterlyBudgets'}[draft.type]);
}
function renderBudgetList(c, type){
  const st = route.params.status, yr = route.params.year;
  let recs = state.budgets.filter(b=>b.type===type);
  const years = [...new Set(recs.map(b=>b.year))].sort();
  const key = {Annual:'annualBudgets',Monthly:'monthlyBudgets',Quarterly:'quarterlyBudgets'}[type];
  if(st) recs = recs.filter(b=>b.status===st); if(yr) recs = recs.filter(b=>String(b.year)===String(yr));
  setHeader('Budget Management', type+' Budgets', newBtn('budgets', 'New '+type+' Budget', {type, year:curYear(), status:'Draft'}));
  c.innerHTML = tabsHtml(BUDGET_STATUSES, st, v=>`goTo('${key}',{status:'${v}',year:'${yr||''}'})`) + (years.length>1 ? `<div style="margin:0 0 10px;font-size:13px">Year: ${['',...years].map(y=>`<a style="cursor:pointer;margin-right:10px;${String(yr||'')===String(y)?'font-weight:700;text-decoration:underline':''}" onclick="goTo('${key}',{status:'${st||''}',year:'${y}'})">${y||'All'}</a>`).join('')}</div>` : '') +
    `<div class="panel"><div class="panel-body">${renderEntityTable('budgets', recs, {preset:{type,year:curYear(),status:'Draft'}})}</div></div>`;
}
function renderCategories(c){
  const t = route.params.type; setHeader('Budget Management','Budget Categories', newBtn('categories'));
  c.innerHTML = tabsHtml(['Expense','Income'], t, v=>`goTo('budgetCategories',{type:'${v}'})`) + `<div class="panel"><div class="panel-body">${renderEntityTable('categories', state.categories.filter(k=>!t||k.type===t))}</div></div>`;
}
function renderSimple(c, ek, intro){
  const recs = [...state[ek]].sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||'')));
  setHeader(SECTION_META[route.section][0], SECTION_META[route.section][1], newBtn(ek));
  c.innerHTML = `<div style="font-size:13px;opacity:.75;margin-bottom:10px">${esc(intro)}</div>` + (ek==='limits'?'':tabsHtml(['Pending','Approved','Rejected'], route.params.status, v=>`goTo('${route.section}',{status:'${v}'})`)).replace(/^$/,'') +
    `<div class="panel"><div class="panel-body">${renderEntityTable(ek, route.params.status ? recs.filter(r=>r.status===route.params.status) : recs)}</div></div>`;
}

/* ---------- 3. Allocations ---------- */
function renderAllocations(c, kind){
  const recs = state.allocations.filter(a=>a.kind===kind), key = {Account:'accountAllocations',Department:'departmentAllocations',Project:'projectAllocations'}[kind];
  const tot = sum(recs,a=>a.amount), sp = sum(recs,a=>spentOfAlloc(a.id)), cm = sum(recs,a=>committedOfAlloc(a.id));
  setHeader('Budget Allocations', kind+' Allocations', newBtn('allocations','New '+kind+' Allocation',{kind}));
  c.innerHTML = `<div class="stat-grid"><div class="stat-card"><div class="num">${fmtMoney(tot)}</div><div class="lbl">Allocated</div></div><div class="stat-card"><div class="num">${fmtMoney(sp)}</div><div class="lbl">Spent</div></div><div class="stat-card"><div class="num">${fmtMoney(cm)}</div><div class="lbl">Committed</div></div><div class="stat-card gold"><div class="num">${fmtMoney(tot-sp-cm)}</div><div class="lbl">Remaining</div></div></div>
    <div class="panel"><div class="panel-body">${renderEntityTable('allocations', recs, {preset:{kind}, emptyHint: state.budgets.length ? 'Split a budget across '+kind.toLowerCase()+'s.' : 'Create a budget first, then split it across '+kind.toLowerCase()+'s.'})}</div></div>`;
}

/* ---------- 4. Control ---------- */
function renderApprovals(c){
  const pend = state.budgets.filter(b=>b.status==='Pending Approval'), log = [...state.approvalLog].reverse().slice(0,50);
  const pr = state.revisions.filter(r=>r.status==='Pending').length, pt = state.transfers.filter(r=>r.status==='Pending').length;
  c.innerHTML = `<div class="stat-grid"><div class="stat-card gold"><div class="num">${pend.length}</div><div class="lbl">Budgets awaiting approval</div></div><div class="stat-card"><div class="num">${pr}</div><div class="lbl"><a style="cursor:pointer" onclick="goTo('budgetRevisions',{status:'Pending'})">Pending revisions</a></div></div><div class="stat-card"><div class="num">${pt}</div><div class="lbl"><a style="cursor:pointer" onclick="goTo('budgetTransfers',{status:'Pending'})">Pending transfers</a></div></div></div>
    <div class="panel"><div class="panel-head"><h3>Waiting for Approval</h3></div><div class="panel-body">${pend.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Code</th><th>Budget</th><th>Type</th><th>Period</th><th>Amount</th><th>Owner</th><th></th></tr></thead><tbody>${pend.map(b=>`<tr><td>${esc(b.code)}</td><td>${esc(b.name)}</td><td>${esc(b.type)}</td><td>${esc(b.period)} ${b.year}</td><td>${fmtMoney(b.amount)}</td><td>${esc(b.owner||'—')}</td><td>${flowBtn('budgets',b.id,'Approved','Approve','primary')} ${flowBtn('budgets',b.id,'Rejected','Reject')}</td></tr>`).join('')}</tbody></table></div>` : emptyMsg('No budgets are waiting for approval. Submit a draft from Annual, Monthly or Quarterly Budgets.')}</div></div>
    <div class="panel"><div class="panel-head"><h3>Approval History</h3></div><div class="panel-body">${log.length ? `<div style="overflow-x:auto"><table><thead><tr><th>Date</th><th>Type</th><th>Item</th><th>Decision</th><th>By</th></tr></thead><tbody>${log.map(l=>`<tr><td>${fmtDate(l.date)}</td><td>${esc(l.kind)}</td><td>${esc(l.ref)}</td><td>${esc(l.decision)}</td><td>${esc(l.by||'—')}</td></tr>`).join('')}</tbody></table></div>` : emptyMsg('No decisions recorded yet.')}</div></div>`;
}
function renderCommitted(c){
  const open = state.commitments.filter(x=>x.status==='Open'), t = route.params.status;
  setHeader('Budget Control','Committed Expenditure', newBtn('commitments'));
  c.innerHTML = `<div class="stat-grid"><div class="stat-card gold"><div class="num">${fmtMoney(sum(open,x=>x.amount))}</div><div class="lbl">Open commitments</div></div><div class="stat-card"><div class="num">${open.length}</div><div class="lbl">Open items</div></div></div>
    <div style="font-size:13px;opacity:.75;margin-bottom:10px">Money promised through purchase orders or contracts but not yet spent. Open commitments reduce what is available in a budget.</div>` +
    tabsHtml(['Open','Invoiced','Released'], t, v=>`goTo('committedExpenditure',{status:'${v}'})`) + `<div class="panel"><div class="panel-body">${renderEntityTable('commitments', state.commitments.filter(x=>!t||x.status===t))}</div></div>`;
}

/* ---------- 5. Forecasting ---------- */
function forecastMonth(type, year, mi){ return sum(state.forecasts.filter(f=>f.type===type && Number(f.year)===year && f.month===MONTHS[mi]), f=>f.amount); }
function renderForecast(c, type){
  const key = type==='Income' ? 'incomeForecast' : 'expenseForecast', yr = Number(route.params.year)||curYear();
  const recs = state.forecasts.filter(f=>f.type===type && Number(f.year)===yr).sort((a,b)=>MONTHS.indexOf(a.month)-MONTHS.indexOf(b.month));
  const vals = MONTHS.map((m,i)=>forecastMonth(type,yr,i)), total = sum(vals,v=>v);
  const actual = type==='Expense' ? MONTHS.map((m,i)=>sum(state.expenses.filter(e=>(e.date||'').slice(0,7)===yr+'-'+String(i+1).padStart(2,'0')),e=>e.amount)) : null;
  setHeader('Forecasting', type+' Forecast', newBtn('forecasts','New '+type+' Forecast',{type, year:yr}));
  c.innerHTML = tabsHtml([yr-1,yr,yr+1].map(String), String(yr), v=>`goTo('${key}',{year:'${v||curYear()}'})`) + `<div class="adx-wrap"><div class="adx-grid adx-g3">
    ${ADX.kpi({i:'trend',l:'Forecast '+yr,v:fmtMoney(total)})}${ADX.kpi({i:'cash',c:'b',l:'Monthly Average',v:fmtMoney(total/12)})}
    ${actual ? ADX.kpi({i:'wallet',c:'o',l:'Actual Spent '+yr,v:fmtMoney(sum(actual,x=>x)),d:`<div class="adx-d fl">${pct(sum(actual,x=>x),total).toFixed(0)}% of forecast</div>`}) : ADX.kpi({i:'wallet',c:'o',l:'Entries',v:recs.length})}
  </div>${ADX.panel('By Month', total||(actual&&sum(actual,x=>x)) ? ADX.bars(MONTHS.map((m,i)=>({l:m.slice(0,3), v:[vals[i]]})), [ADX.C.g]) : emptyMsg('Add a forecast to see the monthly chart.'), {i:'grid'})}</div>
    <div class="panel"><div class="panel-body">${renderEntityTable('forecasts', recs, {preset:{type,year:yr}})}</div></div>`;
}
function renderCashFlow(c){
  const start = new Date(), rows = []; let bal = Number(state.settings.openingCash)||0;
  for(let i=0;i<12;i++){
    const d = new Date(start.getFullYear(), start.getMonth()+i, 1), y = d.getFullYear(), m = d.getMonth();
    const inflow = forecastMonth('Income',y,m), out = forecastMonth('Expense',y,m), open = bal; bal = open+inflow-out;
    rows.push({label:MONTHS[m].slice(0,3)+' '+y, open, inflow, out, net:inflow-out, close:bal});
  }
  const low = rows.reduce((a,r)=>r.close<a.close?r:a, rows[0]);
  setHeader('Forecasting','Cash Flow Forecast','');
  c.innerHTML = `<div class="panel"><div class="panel-body" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"><div class="field" style="margin:0"><label>Opening cash balance</label><input id="openCash" type="number" value="${Number(state.settings.openingCash)||0}"></div><button class="btn primary" onclick="state.settings.openingCash=Number(document.getElementById('openCash').value)||0;saveState();render()">Update</button><span style="font-size:12px;opacity:.7">Built from your Income and Expense forecasts for the next 12 months.</span></div></div>
  <div class="adx-wrap"><div class="adx-grid adx-g3">${ADX.kpi({i:'cash',l:'Closing Cash (12 months)',v:fmtMoney(rows[11].close)})}${ADX.kpi({i:'trend',c:'b',l:'Net Cash Flow',v:fmtMoney(sum(rows,r=>r.net))})}${ADX.kpi({i:'clock',c:'o',l:'Lowest Balance',v:fmtMoney(low.close),d:`<div class="adx-d ${low.close<0?'dn':'fl'}">${low.label}</div>`})}</div>
  ${ADX.panel('Projected Closing Balance', state.forecasts.length ? ADX.line(rows.map(r=>({l:r.label.slice(0,3), v:Math.max(r.close,0)}))) : emptyMsg('Add income and expense forecasts to project your cash.'), {i:'trend'})}</div>
  <div class="panel"><div class="panel-body"><div style="overflow-x:auto"><table><thead><tr><th>Month</th><th>Opening</th><th>Inflows</th><th>Outflows</th><th>Net</th><th>Closing</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.label}</td><td>${fmtMoney(r.open)}</td><td>${fmtMoney(r.inflow)}</td><td>${fmtMoney(r.out)}</td><td style="color:${r.net<0?'var(--danger)':'var(--success)'}">${fmtMoney(r.net)}</td><td style="font-weight:700;color:${r.close<0?'var(--danger)':'inherit'}">${fmtMoney(r.close)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
}

/* ---------- 6. Reports ---------- */
let reportData = {};
function reportPage(c, key, intro, tables){
  reportData[key] = tables;
  const cell = (v,f) => f==='money' ? fmtMoney(v) : f==='pct' ? Number(v).toFixed(1)+'%' : esc(v);
  c.innerHTML = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap"><span style="font-size:13px;opacity:.75;flex:1">${esc(intro)}</span><button class="btn small" onclick="exportReport('${key}')">Export CSV</button><button class="btn small" onclick="window.print()">Print</button></div>` +
    tables.map(t=>`<div class="panel"><div class="panel-head"><h3>${esc(t.title)}</h3></div><div class="panel-body">${t.rows.length ? `<div style="overflow-x:auto"><table><thead><tr>${t.head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r=>`<tr>${r.map((v,i)=>`<td>${cell(v,t.fmts[i])}</td>`).join('')}</tr>`).join('')}${t.foot?`<tr style="font-weight:700">${t.foot.map((v,i)=>`<td>${cell(v,t.fmts[i])}</td>`).join('')}</tr>`:''}</tbody></table></div>` : emptyMsg('No data for this report yet.')}</div></div>`).join('');
}
function exportReport(key){
  const q = v => '"'+String(v==null?'':v).replace(/"/g,'""')+'"', out = [];
  (reportData[key]||[]).forEach(t=>{ out.push(q(t.title)); out.push(t.head.map(q).join(',')); t.rows.forEach(r=>out.push(r.map(q).join(','))); if(t.foot) out.push(t.foot.map(q).join(',')); out.push(''); });
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.join('\n')],{type:'text/csv'})); a.download = key+'-'+todayISO()+'.csv'; a.click();
}
function renderRptVsActual(c){
  const rows = approvedBudgets().map(b=>{ const s = budgetStats(b); return [b.code,b.name,b.period+' '+b.year,s.amount,s.spent,s.committed,s.variance,s.usedActual]; });
  const f = i => sum(rows,r=>r[i]);
  reportPage(c,'budget-vs-actual','Approved budgets compared with what has actually been spent. Variance = budget − actual.',[{title:'Budget vs Actual', head:['Code','Budget','Period','Budget','Actual','Committed','Variance','% Spent'], fmts:['t','t','t','money','money','money','money','pct'], rows, foot: rows.length?['Total','','',f(3),f(4),f(5),f(6),pct(f(4),f(3))]:null}]);
}
function renderRptVariance(c){
  const rows = approvedBudgets().map(b=>{ const s = budgetStats(b); const v = s.variance; return [b.name,b.period+' '+b.year,s.amount,s.spent,v,s.amount?v/s.amount*100:0,v<0?'Unfavourable':'Favourable']; }).sort((a,b)=>a[4]-b[4]);
  const cat = state.categories.filter(k=>k.type==='Expense').map(k=>{ const bs = approvedBudgets().filter(b=>b.categoryId===k.id), bud = sum(bs,b=>b.amount), act = sum(bs,b=>spentOfBudget(b.id)); return [k.name,bud,act,bud-act,bud?(bud-act)/bud*100:0]; }).filter(r=>r[1]||r[2]);
  reportPage(c,'budget-variance','Where spending is above (unfavourable) or below (favourable) budget, largest overspends first.',[
    {title:'Variance by Budget', head:['Budget','Period','Budget','Actual','Variance','Variance %','Result'], fmts:['t','t','money','money','money','pct','t'], rows},
    {title:'Variance by Category', head:['Category','Budget','Actual','Variance','Variance %'], fmts:['t','money','money','money','pct'], rows:cat}]);
}
function renderRptUtilization(c){
  const rows = approvedBudgets().map(b=>{ const s = budgetStats(b); return [b.name,b.period+' '+b.year,s.amount,s.spent,s.committed,s.available,s.used,usageStatus(s.used)]; }).sort((a,b)=>b[6]-a[6]);
  reportPage(c,'budget-utilization','How much of each approved budget is used, counting both spending and open commitments.',[{title:'Budget Utilization', head:['Budget','Period','Budget','Spent','Committed','Available','% Used','Status'], fmts:['t','t','money','money','money','money','pct','t'], rows}]);
}
function renderRptGroup(c, kind){
  const groups = {}; state.allocations.filter(a=>a.kind===kind).forEach(a=>{ const g = groups[a.target] = groups[a.target]||{amt:0,sp:0,cm:0,n:0}; const s = allocStats(a); g.amt+=s.amount; g.sp+=s.spent; g.cm+=s.committed; g.n++; });
  const rows = Object.entries(groups).map(([k,g])=>[k,g.n,g.amt,g.sp,g.cm,g.amt-g.sp-g.cm,pct(g.sp+g.cm,g.amt)]).sort((a,b)=>b[2]-a[2]);
  const f = i => sum(rows,r=>r[i]);
  reportPage(c,kind.toLowerCase()+'-budget-report','Allocated, spent and remaining budget for each '+kind.toLowerCase()+'. Based on '+kind+' Allocations.',[{title:kind+' Budget Report', head:[kind,'Allocations','Allocated','Spent','Committed','Remaining','% Used'], fmts:['t','t','money','money','money','money','pct'], rows, foot: rows.length?['Total',f(1),f(2),f(3),f(4),f(5),pct(f(3)+f(4),f(2))]:null}]);
}

/* ---------- Settings ---------- */
function renderSettings(c){
  const s = state.settings;
  const list = (title,key) => `<div class="settings-block"><h4>${title}</h4><div class="pill-list">${s[key].map((it,i)=>`<span class="pill">${esc(it)}<button onclick="removeSettingItem('${key}',${i})">✕</button></span>`).join('')||'<span style="opacity:.6;font-size:13px">None yet</span>'}</div><div style="margin-top:10px;display:flex;gap:8px"><input id="input_${key}" placeholder="Add new..." style="padding:7px 10px;border:1px solid var(--line);border-radius:3px"><button class="btn small" onclick="addSettingItem('${key}')">+ Add</button></div></div>`;
  c.innerHTML = `<div class="panel"><div class="panel-head"><h3>Company Information</h3></div><div class="panel-body">
    <div class="field-row"><div class="field"><label>Company Name</label><input id="c_name" value="${esc(s.company.name)}"></div><div class="field"><label>Currency</label><input id="c_currency" value="${esc(s.company.currency)}"></div></div>
    <div class="field"><label>Address</label><input id="c_address" value="${esc(s.company.address)}"></div>
    <div class="field-row"><div class="field"><label>Phone</label><input id="c_phone" value="${esc(s.company.phone)}"></div><div class="field"><label>Email</label><input id="c_email" value="${esc(s.company.email)}"></div></div>
    <div class="field-row"><div class="field"><label>Budget number prefix</label><input id="c_prefix" value="${esc(s.budgetNumberingPrefix)}"></div><div class="field"><label>Next budget number</label><input id="c_next" type="number" value="${s.nextBudgetNumber}"></div></div>
    <button class="btn primary" onclick="saveCompanyInfo()">Save</button></div></div>
  <div class="panel"><div class="panel-head"><h3>Lists</h3></div><div class="panel-body">${list('Departments','departments')}${list('Projects','projectNames')}${list('Accounts','accounts')}</div></div>
  <div class="panel"><div class="panel-head"><h3>Install App</h3></div><div class="panel-body"><p style="margin:0 0 10px;font-size:13px;opacity:.75">Install Acacia Budget on this computer or phone so it opens like an app, in its own window.</p><button class="btn primary" id="installBtn" onclick="installApp()">Install Acacia Budget</button></div></div>
  <div class="panel"><div class="panel-head"><h3>Appearance</h3></div><div class="panel-body"><div data-acacia-appearance></div></div></div>
  <div class="panel"><div class="panel-head"><h3>Data</h3></div><div class="panel-body" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="exportData()">Export backup</button><label class="btn" style="cursor:pointer">Import backup<input type="file" accept=".json" style="display:none" onchange="importData(event)"></label><button class="btn" style="color:var(--danger)" onclick="resetAllData()">Erase all data</button></div></div>`;
  if(window.AcaciaAppearance) window.AcaciaAppearance.mount();
}
function saveCompanyInfo(){
  const g = id => document.getElementById(id).value, s = state.settings;
  s.company.name = g('c_name').trim(); s.company.currency = g('c_currency').trim()||'KES'; s.company.address = g('c_address').trim(); s.company.phone = g('c_phone').trim(); s.company.email = g('c_email').trim();
  s.budgetNumberingPrefix = g('c_prefix'); s.nextBudgetNumber = Math.max(1, parseInt(g('c_next'))||1);
  saveState(); toast('Settings saved.');
}
function addSettingItem(key){ const i = document.getElementById('input_'+key), v = i.value.trim(); if(!v) return; if(state.settings[key].some(x=>low(x)===low(v))) return toast('Already in the list.'); state.settings[key].push(v); saveState(); render(); }
function removeSettingItem(key, idx){ state.settings[key].splice(idx,1); saveState(); render(); }
function exportData(){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})); a.download = 'acacia-budget-backup-'+todayISO()+'.json'; a.click(); toast('Data exported.'); }
function importData(e){
  const file = e.target.files[0]; if(!file) return; const r = new FileReader();
  r.onload = evt => { try{ const p = JSON.parse(evt.target.result), b = freshState(); state = Object.assign(b, p, {settings:Object.assign(b.settings, p.settings||{})}); saveState(); toast('Data imported.'); render(); }catch(err){ toast('Could not read that file.'); } };
  r.readAsText(file); e.target.value = '';
}
function resetAllData(){ if(!confirm('This will permanently erase all Acacia Budget data on this device. Continue?')) return; state = freshState(); saveState(); toast('All data cleared.'); goTo('budgetOverview'); }

/* ---------- init ---------- */
document.getElementById('modalOverlay').addEventListener('click', e=>{ if(e.target.id==='modalOverlay') closeModal(); });
updateThemeToggleIcon();
checkSessionOnLoad();
