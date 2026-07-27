// PHYSICA service worker: cache-first app shell so the PWA works fully offline.
// Bump CACHE_NAME whenever any precached file changes.
const CACHE_NAME = "physica-v2.11";

const PRECACHE_URLS = [
  "./",
  "index.html",
  "about.html",
  "mission.html",
  "manifest.json",
  "css/style.css",
  "data/config.json",
  "data/problems.json",
  "data/exams.json",
  "data/packages.json",
  "data/playlists.json",
  "js/app.js",
  "js/about.js",
  "js/mission.js",
  "js/data.js",
  "js/format.js",
  "js/grades.js",
  "js/installPrompt.js",
  "js/radar.js",
  "js/ranks.js",
  "js/scrollTop.js",
  "js/scoring.js",
  "js/snapshot.js",
  "js/storage.js",
  "js/tiles.js",
  "js/toast.js",
  "js/views/home.js",
  "js/views/list.js",
  "js/views/goals.js",
  "js/views/settings.js",
  "js/views/onboarding.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
