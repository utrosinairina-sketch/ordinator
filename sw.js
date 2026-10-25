// Обновляйте VERSION при каждой публикации, если меняете файлы приложения.
const VERSION = 'ordinator-v9-clinical-2026-10-25';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/catalog.js', './js/clinical.js', './js/dynamics.js', './js/excel.js', './js/storage.js', './js/app.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ordinator-') && key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('./index.html')) || Response.error()));
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
