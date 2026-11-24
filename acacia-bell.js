/* acacia-bell.js - the 🔔 What's new + Training (Register) bell for apps without the shared right bar (POS, Plans).
   Loads acacia-whatsnew.js from this folder and starts it for the logged-in user and company. */
(function () {
  'use strict';
  if (window.__acxBell) return; window.__acxBell = true;
  var last = '', loading = false;
  function rd(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function user() {
    var u = null;
    try { if (window.acxSession) { var s = window.acxSession(); if (s) u = s.obj || s; } } catch (e) {}
    if (!u) u = rd('pos_session') || rd('acacia_session');
    if (!u) return null;
    var id = u.email || u.username || u.loginId, c = u.companyId || u.company_id;
    return id && c ? { id: String(id), c: String(c), n: u.fullName || u.name || '' } : null;
  }
  function start() {
    var u = user(), key = u ? u.id.toLowerCase() + '|' + u.c : '';
    if (key === last) return; last = key;
    var b = document.getElementById('awnBell'), p = document.getElementById('awnPanel');
    if (!key) { if (b) b.style.display = 'none'; if (p) p.classList.remove('open'); return; }
    if (b) b.style.display = '';
    window.AcaciaWhatsNew.init({ loginId: u.id, companyId: u.c, userName: u.n, keepJoinUrl: true });
  }
  function tick() {
    if (window.AcaciaWhatsNew) return start();
    if (loading) return; loading = true; window.__awnNoAuto = true;
    var s = document.createElement('script'); s.src = 'acacia-whatsnew.js'; s.onload = start; document.head.appendChild(s);
  }
  setInterval(tick, 2000);
})();
