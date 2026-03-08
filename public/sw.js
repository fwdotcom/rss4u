const CACHE_NAME = "rss4u-shell-v1";

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
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
