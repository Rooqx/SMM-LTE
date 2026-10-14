/* global caches, fetch, Response, self, URL */

const CACHE_VERSION = "autopilot-public-v1";
const OFFLINE_URL = "/offline.html";
const PUBLIC_ASSETS = [
  OFFLINE_URL,
  "/brand/app-icon.svg",
  "/brand/icon-192.png",
  "/brand/icon-512.png",
  "/brand/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PUBLIC_ASSETS))
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
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Authentication and product data always go to the network. Caching these
  // responses could expose one user's private content after sign-out.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return cached || Response.error();
      }),
    );
    return;
  }

  const safeStaticAsset =
    url.pathname.startsWith("/_astro/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/offline.html";

  if (!safeStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response.ok || response.type !== "basic") return response;
        const copy = response.clone();
        void caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
