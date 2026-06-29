/*
 * App-shell service worker (Phase 1).
 *
 * Scope: make the app *load* offline. Capture durability itself does NOT depend on
 * this SW — captures live in IndexedDB (see src/lib/capture) and survive offline
 * regardless. This SW only caches the static shell so the page opens with no network.
 *
 * Registered in production only (see ServiceWorkerRegistrar) to avoid fighting the
 * Next.js dev HMR pipeline. Test full offline-install with `pnpm build && pnpm start`.
 */
const CACHE = "gtd-shell-v1";
const SHELL = ["/", "/inbox", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll is atomic-ish; if one fails the install fails. Shell URLs are all local.
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch non-GET (mutations) or cross-origin requests.
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Navigations: network-first (fresh app), fall back to cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Static assets (hashed /_next/static/*, icons): cache-first.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
