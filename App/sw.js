// Cache the app shell so the AAC and offline Kokoro workflows remain available offline.
const CACHE_NAME = 'math-aac-v31-local-speech';
const APP_ASSETS = ['./index%20(1).html', './styles.css?v=31', './app.js?v=31', './functions.js?v=31', './shared-input.js?v=31', './calculator-access.js?v=31', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('math-aac-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok && decodeURIComponent(new URL(response.url).pathname).endsWith('/index (1).html')) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put('./index%20(1).html', copy)));
      }
      return response;
    }).catch(() => caches.match('./index%20(1).html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    if (response.ok) event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
    return response;
  })));
});
