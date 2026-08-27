/**
 * Minimal service worker — exists only so Chrome's installability check
 * (a fetch handler is required, in addition to the manifest) passes and the
 * Android "install app" prompt can fire. This is not an offline-content
 * feature: nothing outside the two locale start URLs is ever cached, and a
 * page is never served stale while the network is reachable.
 *
 * Hand-written rather than generated: the site is a full static export
 * (`output: "export"` in next.config.ts), so there is no build-time plugin
 * (next-pwa, Serwist, Workbox) wiring this up — this file is deployed as-is
 * from `public/`.
 *
 * Registered only in production, from
 * `src/components/service-worker-registration.tsx`.
 */

const SHELL_CACHE = "klangwelt-shell-v1";
const SHELL_URLS = ["/ja", "/en"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("klangwelt-shell-") && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/*
 * Network-first, navigations only. Everything else (`_next/static`, images,
 * fonts) passes straight through untouched — intercepting those would mean
 * versioning and invalidating a second cache for no offline benefit this
 * site claims to provide, see the file comment above.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        const url = new URL(event.request.url);
        const locale = url.pathname.startsWith("/en") ? "/en" : "/ja";
        return caches.match(locale);
      }),
    ),
  );
});
