const DOCOS_SHELL_CACHE = 'docos-shell-v63';
const DOCOS_RUNTIME_CACHE = 'docos-runtime-v8';
const DOCOS_VIDEO_CACHE = 'docos-video-v1';
const DOCOS_CACHE_PREFIXES = ['docos-shell-', 'docos-runtime-', 'docos-video-'];
const VIDEO_SEG_RE = /\.(m3u8|ts|m4s|mpd|init)(\?|$)/i;
const VIDEO_MAX_ENTRIES = 80;
const VIDEO_MAX_SEGMENT_BYTES = 6 * 1024 * 1024;

const DOCOS_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './styles-pro.css',
  './pro.js',
  './cloud.js',
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
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'
];

const DOCOS_RUNTIME_SET = new Set(DOCOS_RUNTIME_URLS);

async function putIfValid(cacheName, request, response) {
  if (!response || (!response.ok && response.type !== 'opaque')) return response;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function shellCacheFirst(request) {
  // Network-first for shell — always try the network so deploys land instantly.
  // Cache is only used as offline fallback. Saves users from "I deployed but
  // user still sees old code" cache-trap.
  const cache = await caches.open(DOCOS_SHELL_CACHE);
  try {
    const fresh = await fetch(request, { cache: 'no-store' });
    if (fresh && fresh.ok) {
      putIfValid(DOCOS_SHELL_CACHE, request, fresh.clone()).catch(() => {});
      return fresh;
    }
    // 4xx/5xx → fall back to cache
    const cached = await cache.match(request);
    if (cached) return cached;
    return fresh;
  } catch (_) {
    // Offline → cache fallback
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('offline-no-cache');
  }
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (let i = 0; i < keys.length - max; i++) {
    await cache.delete(keys[i]);
  }
}

// Range-aware video segment cache (HLS / DASH friendly).
// Strategy: cache-first for whole-segment GETs without Range; pass-through
// for Range/byte requests (browser handles partial fetches via network).
// Manifests get short SWR so playlists update.
async function videoSegmentCache(request) {
  const url = new URL(request.url);
  const isManifest = /\.m3u8(\?|$)/i.test(url.pathname);
  const hasRange = request.headers.has('range');

  // Range/byte requests → straight network (don't poison cache with partials)
  if (hasRange) return fetch(request);

  const cache = await caches.open(DOCOS_VIDEO_CACHE);
  if (isManifest) {
    // SWR — fast cached return + background refresh
    const cached = await cache.match(request);
    const networkPromise = fetch(request).then(resp => {
      if (resp && (resp.ok || resp.type === 'opaque')) {
        cache.put(request, resp.clone()).catch(() => {});
      }
      return resp;
    }).catch(() => null);
    if (cached) {
      networkPromise.catch(() => {});
      return cached;
    }
    const fresh = await networkPromise;
    return fresh || fetch(request);
  }

  // Segments → cache-first, network fill, size-bounded
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && (fresh.ok || fresh.type === 'opaque')) {
    const len = parseInt(fresh.headers.get('content-length') || '0', 10);
    if (!len || len <= VIDEO_MAX_SEGMENT_BYTES) {
      cache.put(request, fresh.clone()).then(() => trimCache(DOCOS_VIDEO_CACHE, VIDEO_MAX_ENTRIES)).catch(() => {});
    }
  }
  return fresh;
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
        .filter(key => DOCOS_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)) && ![DOCOS_SHELL_CACHE, DOCOS_RUNTIME_CACHE, DOCOS_VIDEO_CACHE].includes(key))
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
    return;
  }

  // Cross-origin video segments / manifests → cache-first SWR
  if (VIDEO_SEG_RE.test(url.pathname)) {
    event.respondWith(videoSegmentCache(req).catch(() => fetch(req)));
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
