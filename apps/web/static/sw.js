const CACHE_NAME = 'hello-world-pwa-v1';
const APP_SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});
