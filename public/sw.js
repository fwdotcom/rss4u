const CACHE_NAME = "rss4u-shell-v2";
const IS_LOCAL_DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";

const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./rss.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-16.png",
  "./icon-32.png",
  "./icon-48.png",
  "./icon-128.png",
  "./themes/light/theme.css",
  "./themes/dark/theme.css",
  "./themes/light/tile.template.html",
  "./themes/dark/tile.template.html",
  "./locales/en.json",
  "./locales/de.json",
  "./locales/fr.json",
  "./locales/es.json",
  "./locales/it.json",
  "./locales/pl.json",
  "./locales/cs.json",
  "./locales/nl.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (IS_LOCAL_DEV) {
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      const networkResponse = await fetch(event.request);
      if (networkResponse.ok) {
        await cache.put(event.request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      if (event.request.mode === "navigate") {
        const fallback = await cache.match("./index.html");
        if (fallback) {
          return fallback;
        }
      }

      throw error;
    }
  })());
});
