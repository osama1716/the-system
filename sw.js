// Network-first service worker: whenever you're online, every file is fetched
// fresh from the network (so an edit + redeploy shows up the next time you
// open the app — no reinstall needed) and quietly cached as an offline
// fallback. Only when the network fails does it serve the last cached copy.
const CACHE_NAME = "the-system-v1";
const CORE_ASSETS = [
  "./", "./index.html", "./styles.css", "./manifest.json",
  "./js/constants.js", "./js/storage.js", "./js/engine.js", "./js/sound.js", "./js/ui.js", "./js/main.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
