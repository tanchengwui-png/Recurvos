const CACHE_NAME = "recurvos-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons.svg",
  "/pwa-icon.svg",
  "/pwa-icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        return response;
      } catch {
        const cachedAppShell = await caches.match("/index.html");
        return cachedAppShell ?? caches.match("/offline.html");
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response.ok && (request.destination === "script" || request.destination === "style" || request.destination === "image" || request.destination === "font")) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }

      return response;
    } catch {
      return Response.error();
    }
  })());
});
