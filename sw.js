const V = 'sticks-v5';
const CORE = ['./', 'index.html', 'css/app.css', 'js/app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
const LIBS = ['https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];
self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(V);
  await c.addAll(CORE);
  await Promise.allSettled(LIBS.map(u => c.add(new Request(u, { mode: 'cors' }))));
  self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || !r.url.startsWith('http')) return;
  e.respondWith((async () => {
    const c = await caches.open(V);
    const hit = await c.match(r, { ignoreSearch: true });
    const net = fetch(r).then(x => { if (x.ok && (x.type === 'basic' || x.type === 'cors')) c.put(r, x.clone()); return x; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (r.mode === 'navigate' ? c.match('index.html') : Response.error());
  })());
});
