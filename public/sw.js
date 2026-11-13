/*
 * Manga Automobiles service worker.
 *
 * Makes the app installable and lets it open with no connection:
 *  - Pages: network first, so a deploy shows up straight away; offline, the
 *    last copy of the app shell is used.
 *  - /assets/*: Vite fingerprints these, so a cached copy never goes stale.
 *  - Everything cross-origin (Supabase data, auth, storage, fonts) is left
 *    alone: business data is always live, never served from a cache.
 */
const VERSION = "v1";
const SHELL = `manga-shell-${VERSION}`;
const ASSETS = `manga-assets-${VERSION}`;
const SHELL_FILES = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).catch(() => {}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page asks the waiting worker to take over when the user taps "Update"
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  if (SHELL_FILES.includes(url.pathname) || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const fresh = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => hit);
        return hit || fresh;
      })
    );
  }
});
