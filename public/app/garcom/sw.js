const cacheName = 'aladay-garcom-offline-v1';
const offlinePage = '/app/garcom/offline.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.add(offlinePage)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('aladay-garcom-offline-') && key !== cacheName).map(key => caches.delete(key)),
  )));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' ||
      url.origin !== self.location.origin || url.pathname !== '/app/garcom/') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(offlinePage).then(page => page || Response.error())));
});
