// The app's own code and pages are network-first: whenever you're online,
// they are fetched fresh (so an edit + redeploy shows up the next time you
// open the app — no reinstall needed) and quietly cached as an offline
// fallback; only when the network fails is the cached copy served.
//
// Pictures, videos and sounds are the other way round. assets.json (written
// by scripts/build.js) lists every one with a hash of its bytes; after the
// app opens, the whole list (~6 MB) is downloaded once in the background and
// kept in its own cache, which updates do not wipe. From then on every image
// comes from the phone at once — nothing waits on the network when a page or
// a frame opens — and a later deploy fetches only the files whose hash moved.
const CACHE_NAME = "the-system-v233";
const ASSET_CACHE = "the-system-assets";
const CORE_ASSETS = [
  "./", "./index.html", "./manifest.json",
  // Every script and the stylesheet, built into one file each (scripts/build.js).
  "./app.min.js", "./app.min.css",
  "./icons/favicon-32-v3.png", "./icons/favicon-64-v3.png",
  "./icons/icon-192-v2.png", "./icons/icon-512-v2.png", "./icons/icon-maskable-512-v2.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---- the pictures, videos and sounds ---------------------------------------
const scoped = (rel) => new URL(rel, self.registration.scope).href;
const isAsset = (url) => url.href.startsWith(scoped("./assets/")) || url.href === scoped("./icons/mark-on-dark.png") || url.href === scoped("./icons/mark-on-light.png");
// What was downloaded, at which hash: a record kept in the cache, not a file.
const HELD_KEY = self.registration.scope + "__assets-held";
let syncing = null;
// Brings the asset cache in line with assets.json: fetches what is missing or
// changed, a few at a time, and drops what the list no longer has. Run once
// per page load (the page asks, shortly after it has drawn), never twice at
// once.
function syncAssets() {
  if (syncing) return syncing;
  syncing = (async () => {
    const res = await fetch(scoped("./assets.json"), { cache: "no-cache" });
    if (!res.ok) return;
    const list = await res.json();
    const cache = await caches.open(ASSET_CACHE);
    const keyOf = (rel) => scoped("./" + rel);
    // What was downloaded, and at which hash, is kept beside the files.
    const seenRes = await cache.match(HELD_KEY);
    const held = seenRes ? await seenRes.json() : {};
    const todo = Object.keys(list).filter((rel) => held[rel] !== list[rel]);
    const work = todo.slice();
    const one = async () => {
      for (let rel = work.shift(); rel; rel = work.shift()) {
        try {
          const r = await fetch(keyOf(rel) + "?v=" + list[rel], { cache: "no-cache" });
          if (!r.ok) continue;
          await cache.put(keyOf(rel), r);
          held[rel] = list[rel];
        } catch (e) { /* offline or flaky: the next open tries again */ }
      }
    };
    await Promise.all([one(), one(), one()]);
    for (const rel of Object.keys(held)) {
      if (!(rel in list)) { await cache.delete(keyOf(rel)); delete held[rel]; }
    }
    await cache.put(HELD_KEY, new Response(JSON.stringify(held), { headers: { "Content-Type": "application/json" } }));
  })().finally(() => { syncing = null; });
  return syncing;
}
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "sync-assets") event.waitUntil(syncAssets().catch(() => {}));
});

// A video asks for byte ranges; a cached whole file answers with the part.
async function rangeOf(res, header) {
  const m = /bytes=(\d*)-(\d*)/.exec(header || "");
  if (!m) return res;
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  const start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  const end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206, statusText: "Partial Content",
    headers: { "Content-Type": res.headers.get("Content-Type") || "video/mp4", "Content-Range": "bytes " + start + "-" + end + "/" + size, "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" },
  });
}
// Cache first; a file not yet downloaded is fetched and kept on the way.
function serveAsset(event, url) {
  const key = url.origin + url.pathname;
  event.respondWith((async () => {
    const cache = await caches.open(ASSET_CACHE);
    let hit = await cache.match(key);
    if (!hit) {
      try {
        const r = await fetch(key);
        if (r.ok) { await cache.put(key, r.clone()); hit = r; } else return r;
      } catch (e) { return Response.error(); }
    }
    const range = event.request.headers.get("range");
    return range ? rangeOf(hit.clone(), range) : hit;
  })());
}

// ---------------------------------------------------------------------------
// Reminders arrive here. The page is usually closed when they do — that is
// the entire point of a reminder — so this is the only code that runs.
//
// Every push must be shown. Browsers grant the permission on that basis and
// withdraw it from senders who push silently, which would take the feature
// away from the person rather than from us.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: "The System", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "The System";
  const options = {
    body: payload.body || "",
    icon: "./icons/icon-192-v2.png",
    badge: "./icons/favicon-64-v3.png",
    // Same tag replaces rather than stacks: three 07:00 reminders should be
    // one line to read, not three notifications to dismiss.
    tag: payload.tag || "reminder",
    renotify: true,
    data: { url: payload.url || "./" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a reminder should land in the app, and in the copy of it that is
// already open if there is one — a second window with the same state in it
// is nobody's idea of help.
//
// The open copy is also told where the notification pointed, since focusing a
// window does not navigate it: an admin notification should land on the admin
// page, not on whichever page was left open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.indexOf(self.registration.scope) === 0 && "focus" in client) {
          client.postMessage({ type: "open", url: target });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Only this app's own files. Firebase SDKs, Google Fonts and API traffic go
  // straight to the network untouched — they have their own caching, and
  // opaque cross-origin responses aren't useful in our offline cache anyway.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (isAsset(url)) return serveAsset(event, url);

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
