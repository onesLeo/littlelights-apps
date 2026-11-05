// Offline support: the app shell is cached on install; fonts are cached the first time they load.
// Pages are served stale-while-revalidate (see the fetch handler below).
// Bump VERSION whenever a cached file changes so visitors get the new one.
const VERSION = 'll-v101';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'fonts/fonts.css',
  'fonts/parisienne-normal-400.woff2',
  'fonts/bricolage-normal-400.woff2',
  'fonts/bricolage-normal-600.woff2',
  'fonts/bricolage-normal-800.woff2',
  'fonts/newsreader-normal-400.woff2',
  'fonts/newsreader-italic-400.woff2',
  'fonts/newsreader-italic-500.woff2',
  'js/analytics.js',
  'js/config.js',
  'js/store.js',
  'js/vendor/supabase-2.117.2.js',
  'js/content.js',
  'js/seo.js',
  'js/reel-text.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  // Bedtime story read-along timings (js/content.js bedtimeStories[].timings), so the highlight works offline.
  'media/audio/jonah-and-the-whale-timings.json',
  'media/audio/elijah-still-small-voice-timings.json',
  'media/audio/the-smallest-star-timings.json',
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
  // Private, live data (Studio Insights): never cached.
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;

  // Pages (/, /watch, /read/brave, ...): stale-while-revalidate. A page this device has seen before opens
  // straight from the cache (no wait for the network on a slow phone connection) and the fresh copy is fetched
  // in the background for next time; new posts still appear at once, because the app loads them from
  // Supabase after the page opens. A page not seen before comes from the network and is kept. Offline, an
  // app address without its own copy gets the app shell, which routes by path. A new deploy changes sw.js
  // (new asset names), and the new VERSION drops every page cached by the old one, so a cached page never
  // outlives the files it points at.
  if (req.mode === 'navigate') {
    const app = url.origin === location.origin && !url.pathname.startsWith('/studio');
    let saved = Promise.resolve();
    const network = fetch(req).then((res) => {
      if (app && res.ok && !res.redirected) {
        const copy = res.clone();
        saved = caches.open(VERSION).then((cache) => cache.put(url.pathname, copy)).catch(() => {});
      }
      return res;
    });
    const offline = () => caches.match(app ? url.pathname : req, { ignoreSearch: true })
      .then((hit) => hit || (app ? caches.match('./') : undefined))
      .then((hit) => hit || caches.match('index.html'));
    if (!app) { event.respondWith(network.catch(offline)); return; }
    // Only a page that is itself cached is served stale; the background fetch keeps it fresh.
    event.waitUntil(network.then(() => saved, () => {}));
    event.respondWith(caches.open(VERSION).then((cache) => cache.match(url.pathname, { ignoreSearch: true }))
      .then((hit) => hit || network.catch(offline)));
    return;
  }
  // Studio files (studio.css, studio.js) are not fingerprinted and must match the Studio page, so they
  // always come from the network, checked with the server (no-cache); the cached copy is only for offline.
  if (url.origin === location.origin && url.pathname.startsWith('/studio/')) {
    event.respondWith(
      caches.open(VERSION).then((cache) => fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cache.match(req, { ignoreSearch: true })))
    );
    return;
  }
  // Same-site files and Google Fonts: serve from cache, refresh in the background.
  if (url.origin === location.origin) {
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
