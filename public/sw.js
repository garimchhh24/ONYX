/* CADENCE service worker — offline app shell, asset caching and push reminders. */
const VERSION = 'cadence-v1';
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const ROUTES = ['/', '/journal', '/analyze', '/analytics', '/calendar', '/settings', '/accounts', '/trade', '/trade/edit', '/journal/new', '/brand', '/login'];
const STATIC = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/badge-96.png', '/brand/cadence-symbol.svg'];
const MAX_ASSETS = 400;

async function precache() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  await assets.addAll(STATIC).catch(() => undefined);
  // Cache every route's HTML and the build chunks it references, so the whole app opens offline.
  await Promise.all(
    ROUTES.map(async (route) => {
      try {
        const res = await fetch(route, { credentials: 'same-origin', cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.clone().text();
        await pages.put(route, res);
        const urls = [...new Set([...html.matchAll(/["'(](\/_next\/static\/[^"')\s]+)/g)].map((m) => m[1]))];
        await Promise.all(urls.map((u) => assets.match(u).then((hit) => hit || assets.add(u).catch(() => undefined))));
      } catch {
        /* offline during install — runtime caching fills in later */
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // AI, push and config always hit the network

  // Page navigations: network first, then the cached page (search params ignored → /trade?id=… works offline).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (await cache.match(url.pathname)) || (await cache.match(req, { ignoreSearch: true })) || (await cache.match('/')) || Response.error();
        }),
    );
    return;
  }

  // React Server Component payloads for client navigation: network first, cached copy offline.
  if (req.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true })) || Response.error()),
    );
    return;
  }

  // Immutable build assets and brand files: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/brand/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy).then(() => trim(ASSETS, MAX_ASSETS)));
            }
            return res;
          }),
      ),
    );
  }
});

// ───────── Push reminders ─────────
self.addEventListener('push', (event) => {
  let data = { title: 'CADENCE', body: 'Time to journal today’s trades.', url: '/journal?filter=unjournaled', tag: 'cadence-reminder' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag,
      renotify: false,
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          w.focus();
          return w.navigate(target);
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
