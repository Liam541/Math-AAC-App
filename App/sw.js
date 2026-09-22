// Cache only the app shell; never cache speech, status, or arbitrary external requests.
const CACHE_NAME = 'math-aac-v22';
const APP_ASSETS = ['./', './index.html', './styles.css?v=22', './math.js?v=22', './speech.js?v=22', './app.js?v=22', './manifest.json'];
const ASSET_URLS = new Set(APP_ASSETS.map(asset => new URL(asset, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('math-aac-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Versioned launch URLs bypass old cache-first workers; all new navigations share one offline page.
  const asset = event.request.mode === 'navigate' ? new URL('./index.html', self.registration.scope).href : url.href;
  if (!ASSET_URLS.has(asset)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(asset, response.clone());
      return response;
    } catch {
      return await cache.match(asset) || Response.error();
    }
  })());
});
