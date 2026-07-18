// English 360° — service worker.
//
// Strategy:
//   - Precache (install): "/", "/nauka", "/kalendarz", "/slownik" + icon
//   - Runtime for HTML: network-first, cache fallback, then /
//   - Runtime for other same-origin GETs (CSS, JS, images, JSON): cache-first,
//     network fallback, cache the successful response
//
// Update: skipWaiting + clients.claim → new SW takes over immediately at next
// navigation. Users get updated content silently on the next visit.
//
// BASE is derived from the SW's own path so the same file works both in dev
// (served at /sw.js) and in prod under GitHub Pages (/English360/sw.js).

// Bump this whenever the shell needs to be invalidated: SW logic change,
// manifest/icon change, precache list change, or a manual "spring clean".
// Format: v0.NNN with a leading zero so string comparison stays sane until
// we ever ship a "real" v1. Increment by 0.001 per bump.
const VERSION = 'v0.005';
const PRECACHE = `en360-precache-${VERSION}`;
const RUNTIME = `en360-runtime-${VERSION}`;

const BASE = self.location.pathname.replace(/\/sw\.js$/, '');

const PRECACHE_URLS = [
  `${BASE}/`,
  `${BASE}/nauka`,
  `${BASE}/kalendarz`,
  `${BASE}/slownik`,
  `${BASE}/icons/icon.svg`,
  `${BASE}/manifest.webmanifest`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then(async (cache) => {
      // Cache each URL individually so one 404 does not abort the whole
      // install. Missing routes (e.g. someone renames /nauka) get logged
      // but the SW still becomes active.
      await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn('[sw] precache failed:', url, err);
          }),
        ),
      );
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('en360-') && !k.endsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const accept = request.headers.get('accept') || '';
  const isHTMLNav = request.mode === 'navigate' || accept.includes('text/html');

  if (isHTMLNav) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last-resort fallback: precached home so the shell at least renders.
    const home = await caches.match(`${BASE}/`);
    if (home) return home;
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 504 });
  }
}
