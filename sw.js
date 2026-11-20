const RELEASE = '20261120-3';
const PREFIX = `my-day-by-chepo:${new URL(self.registration.scope).pathname}:`;
const CACHE = PREFIX + RELEASE;
const SHELL = ['./', './index.html', `./styles.css?v=${RELEASE}`, `./app.mjs?v=${RELEASE}`, `./core.mjs?v=${RELEASE}`, './icon.svg', './manifest.webmanifest'];
const assets = new Map(SHELL.map(path => { const url = new URL(path, self.registration.scope); return [url.pathname, url.href]; }));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => (key.startsWith(PREFIX) || key === 'my-day-by-chepo-v1') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const asset = assets.get(url.pathname);
  if (!asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(asset);
    if (cached) return cached;
    try {
      const response = await fetch(asset);
      if (response.ok && !response.redirected) await cache.put(asset, response.clone());
      return response;
    } catch {
      return new Response('No hay conexión y este archivo todavía no está disponible sin internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
