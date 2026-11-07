/* ========================================
   EduPlanner Service Worker
   Network-first for app files (so updates reach users),
   cache fallback for offline use.

   Bump CACHE_VERSION on every release to clear old caches.
   ======================================== */

const CACHE_VERSION = 'v3';
const CACHE_NAME = 'eduplanner-' + CACHE_VERSION;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './analytics.js',
  './manifest.json',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Hosts we never cache (analytics beacons/APIs)
const NO_CACHE_HOSTS = ['static.cloudflareinsights.com', 'cloudflareinsights.com'];

// Install — cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function putInCache(request, response) {
  // Only cache successful (or opaque CDN) responses
  if (!response || (response.status !== 200 && response.type !== 'opaque')) return;
  const clone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
}

// Fetch — network first, fall back to cache when offline
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;
  if (NO_CACHE_HOSTS.some((h) => url.hostname.endsWith(h)) || url.hostname.includes('posthog.com')) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        putInCache(req, response);
        return response;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: url.origin === location.origin })
          .then((cached) => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
          .then((res) => res || Response.error())
      )
  );
});
