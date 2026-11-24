/* Acacia Budget service worker: caches the app shell so it installs and opens offline. */
const CACHE='acacia-budget-v1';
const SHELL=['./','index.html','style.css','script.js','acacia-dash.css','acacia-dash.js','acacia-theme.js','acacia-appearance.js','acacia-actions.js','acacia-signout.js','acacia-help.js','acacia-sidebar.js','acacia-brand.js','icon-192.png','icon-512.png','manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET'||new URL(r.url).origin!==location.origin) return;   /* Supabase and other sites go straight to the network */
  e.respondWith(fetch(r).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));return res;}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))));
});
