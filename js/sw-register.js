// The service worker (sw.js). A file rather than an inline script: the
// page's Content-Security-Policy allows exactly one inline script, the theme
// that has to run before the first pixel, by its hash.
// Only works over https (or localhost) — silently no-ops on file:// or plain http.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
