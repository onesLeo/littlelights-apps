// Offline support: the app shell is cached on install; fonts are cached the first time they load.
// Bump VERSION whenever a cached file changes so visitors get the new one.
const VERSION = 'll-v12';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'fonts/fonts.css',
  'fonts/bricolage-normal-400.woff2',
  'fonts/bricolage-normal-600.woff2',
  'fonts/bricolage-normal-800.woff2',
  'fonts/newsreader-normal-400.woff2',
  'fonts/newsreader-italic-400.woff2',
  'fonts/newsreader-italic-500.woff2',
  'js/config.js',
  'js/store.js',
  'js/vendor/supabase-2.117.2.js',
  'js/content.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: try the network first so new posts appear, fall back to the cached app.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
    return;
  }
  // Same-site files and Google Fonts: serve from cache, refresh in the background.
  if (url.origin === location.origin || url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(req).then((hit) => {
          const fresh = fetch(req).then((res) => {
            if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || fresh;
        })
      )
    );
  }
});
