const DOCOS_SHELL_CACHE = 'docos-shell-v17';
const DOCOS_RUNTIME_CACHE = 'docos-runtime-v7';
const DOCOS_CACHE_PREFIXES = ['docos-shell-', 'docos-runtime-'];

const DOCOS_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './styles-pro.css',
  './pro.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

const DOCOS_RUNTIME_URLS = [
  'https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css',
  'https://cdn.jsdelivr.net/npm/idb@8/build/umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.min.mjs',
  'https://cdn.jsdelivr.net/npm/compromise@14.15.0/+esm',
  'https://cdn.jsdelivr.net/npm/compromise-dates@3.7.1/+esm',
  'https://cdn.jsdelivr.net/npm/libphonenumber-js@1.12.38/+esm',
  'https://cdn.jsdelivr.net/npm/chrono-node@2.8.4/+esm',
  'https://cdn.jsdelivr.net/npm/franc-min@6.2.0/+esm',
  'https://cdn.jsdelivr.net/npm/p-limit@7.1.1/+esm',
  'https://cdn.jsdelivr.net/npm/@json-editor/json-editor@2.15.2/dist/jsoneditor.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/fuse.js@7.1.0/dist/fuse.min.js',
  'https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/plugin/customParseFormat.js',
  'https://cdn.jsdelivr.net/npm/body-scroll-lock@4.0.0-beta.0/lib/bodyScrollLock.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs'
];

const DOCOS_RUNTIME_SET = new Set(DOCOS_RUNTIME_URLS);

async function putIfValid(cacheName, request, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function shellCacheFirst(request) {
  const cache = await caches.open(DOCOS_SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  await putIfValid(DOCOS_SHELL_CACHE, request, response.clone());
  return response;
}

async function runtimeStaleWhileRevalidate(request) {
  const cache = await caches.open(DOCOS_RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(response => putIfValid(DOCOS_RUNTIME_CACHE, request, response))
    .catch(() => null);

  if (cached) return cached;

  const fresh = await networkPromise;
  if (fresh) return fresh;
  return fetch(request);
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(DOCOS_SHELL_CACHE)
      .then(cache => cache.addAll(DOCOS_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => DOCOS_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)) && ![DOCOS_SHELL_CACHE, DOCOS_RUNTIME_CACHE].includes(key))
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(response => putIfValid(DOCOS_SHELL_CACHE, './index.html', response.clone()).then(() => response))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      shellCacheFirst(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (DOCOS_RUNTIME_SET.has(req.url)) {
    event.respondWith(runtimeStaleWhileRevalidate(req));
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'DOCOS_SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
