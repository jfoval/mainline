/*
 * App-shell service worker (Phase 1).
 *
 * Scope: make the app *load* offline. Capture durability does NOT depend on this SW —
 * captures live in IndexedDB (see src/lib/capture) and survive offline regardless. This SW
 * only caches the static shell so the page opens with no network.
 *
 * Paths are RELATIVE to this script's URL so it works whether the app is served at "/" (local)
 * or under "/mainline/" (GitHub Pages). The SW's scope is its own directory.
 *
 * Registered in production only (see ServiceWorkerRegistrar) to avoid fighting Next dev HMR.
 */
const CACHE = "mainline-shell-v1";
// Relative to the SW location → "/" locally, "/mainline/" on Pages. trailingSlash routes.
const SHELL = ["./", "./inbox/", "./manifest.webmanifest", "./icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
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

  // The app shell root, resolved against this SW's scope.
  const shellRoot = new URL("./", self.location.href);

  // Navigations: network-first (fresh app), fall back to cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match(shellRoot))),
    );
    return;
  }

  // Static assets (hashed _next/static/*, icons): cache-first.
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
