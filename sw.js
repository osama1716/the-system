// Network-first service worker: whenever you're online, every file is fetched
// fresh from the network (so an edit + redeploy shows up the next time you
// open the app — no reinstall needed) and quietly cached as an offline
// fallback. Only when the network fails does it serve the last cached copy.
const CACHE_NAME = "the-system-v7";
const CORE_ASSETS = [
  "./", "./index.html", "./styles.css", "./manifest.json",
  "./js/i18n.js", "./js/constants.js", "./js/storage.js", "./js/engine.js", "./js/cloud.js",
  "./js/firebase-config.js", "./js/appcheck-config.js", "./js/ui.js", "./js/main.js",
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
  // Only this app's own files. Firebase SDKs, Google Fonts and API traffic go
  // straight to the network untouched — they have their own caching, and
  // opaque cross-origin responses aren't useful in our offline cache anyway.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // `cache: "no-cache"` forces a revalidation with the server rather than
  // letting the browser's own HTTP cache answer. Without it "network-first"
  // is a misnomer: GitHub Pages serves these with a max-age, so the browser
  // returned a stale copy without ever asking, and a deployed fix only
  // reached people who knew to hard-refresh. This still sends If-None-Match,
  // so unchanged files come back as a cheap 304.
  //
  // Wrapped because re-constructing a navigation request is rejected by some
  // browsers — a throw here would fail the page load outright, so fall back
  // to the plain request rather than risk that.
  let request;
  try {
    request = new Request(event.request, { cache: "no-cache" });
  } catch (e) {
    request = event.request;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        // fetch() only *rejects* when the network itself fails. A 404 or a
        // 500 resolves perfectly happily — and GitHub Pages serves both for a
        // second or two while a push rolls out across its edges.
        //
        // Returning such a response handed the page an HTML error document
        // where a script should be. A classic <script> that fails to parse
        // fails silently and does not stop the ones after it, so the app
        // carried on with, say, SYS.renderSidebar never defined, and died at
        // first render on the splash screen. Caching it was worse: the error
        // page then lived under js/ui.js, so the breakage outlived the deploy
        // and, offline, would never have healed at all.
        //
        // A stale-but-real copy is always better than a fresh error page.
        if (!res.ok) return caches.match(event.request).then((hit) => hit || res);
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
