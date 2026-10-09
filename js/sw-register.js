// The service worker (sw.js). A file rather than an inline script: the
// page's Content-Security-Policy allows exactly one inline script, the theme
// that has to run before the first pixel, by its hash.
// Only works over https (or localhost) — silently no-ops on file:// or plain http.
//
// Once the page has drawn, the worker is asked to bring every picture, video
// and sound down in the background (see syncAssets in sw.js), so the app
// behaves like an installed one: whatever opens next is already on the phone.
// Asking on every load is cheap — only files missing or changed are fetched.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.ready.then((reg) => {
      setTimeout(() => { if (reg.active) reg.active.postMessage({ type: "sync-assets" }); }, 1500);
    }).catch(() => {});
  });
}
