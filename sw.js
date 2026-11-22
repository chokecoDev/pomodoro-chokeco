/**
 * =========================================================================
 * POMODORO PRO — SERVICE WORKER (APP SHELL 100% OFFLINE)
 * =========================================================================
 */

const CACHE_NAME = 'pomodoro-pro-shell-v2';

const CORE_ASSETS = [
  './',
  './pomodoro.html',
  './manifest.json',
  './css/styles.css',
  './js/constants.js',
  './js/utils.js',
  './js/storage.js',
  './js/audio.js',
  './js/ui-helpers.js',
  './js/tasks.js',
  './js/timer.js',
  './js/habits.js',
  './js/progress.js',
  './js/history.js',
  './js/reports.js',
  './js/app.js',
  './assets/icons/favicon.svg',
  './assets/icons/favicon.ico',
  './assets/icons/favicon-16x16.png',
  './assets/icons/favicon-32x32.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png',
  './assets/icons/icon-maskable-512.png',
];

const OPTIONAL_ASSETS = [
  './index.html',
  './favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cachear todos los activos principales de forma tolerante en dev/prod
      await Promise.allSettled(
        CORE_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      );
      await Promise.allSettled(
        OPTIONAL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegación HTML: cache-first con actualización en segundo plano y fallback offline
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(networkFetch);
          return cached;
        }

        return networkFetch.then(async (res) => {
          if (res) return res;
          return (
            (await caches.match('./index.html')) ||
            (await caches.match('./pomodoro.html')) ||
            (await caches.match('./'))
          );
        });
      })
    );
    return;
  }

  // Activos estáticos (CSS, JS, íconos, manifest): Cache-First con revalidación suave
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./pomodoro.html'));
    })
  );
});
