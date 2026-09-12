// Reminders: asking the browser for permission, subscribing to push, and
// keeping the subscription where the server can find it.
//
// This is standard Web Push, not Firebase Cloud Messaging. The page needs no
// messaging SDK: the service worker receives the push, and the only thing
// stored server-side is the subscription the browser hands out.
//
// Three things have to be true for a reminder to arrive, and they fail
// independently — which is why the UI reports them separately rather than as
// one on/off switch:
//
//   1. the browser supports push at all (Safari only does as an installed
//      app, so on an iPhone this means "added to the home screen")
//   2. the person granted permission
//   3. a subscription exists and the server has it
(function (SYS) {
  "use strict";

  const supported = () => !!(
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
  SYS.pushSupported = supported;

  // Safari grants push only to a PWA launched from the home screen. Worth
  // telling apart from "not supported", because the fix is a thing the
  // person can actually do.
  SYS.pushNeedsInstall = function () {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    return iOS && !installed;
  };

  SYS.pushPermission = function () {
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;          // "granted" | "denied" | "default"
  };

  // The push service's own key format: base64url in, Uint8Array out.
  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function keyToBase64(key) {
    const bytes = new Uint8Array(key);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // A short, stable id for one subscription, so re-subscribing on the same
  // device overwrites its row instead of adding another. The endpoint is long
  // and contains characters Firestore will not take in a document id.
  function endpointId(endpoint) {
    let hash = 2166136261;
    for (let i = 0; i < endpoint.length; i++) {
      hash ^= endpoint.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return "s" + (hash >>> 0).toString(36) + endpoint.length.toString(36);
  }

  let cachedKey = null;
  function serverKey() {
    if (cachedKey) return Promise.resolve(cachedKey);
    if (!SYS.Cloud || !SYS.Cloud.callPushConfig) return Promise.reject(new Error("Cloud sync isn't set up yet."));
    return SYS.Cloud.callPushConfig().then((res) => {
      cachedKey = res && res.publicKey;
      if (!cachedKey) throw new Error("No push key available.");
      return cachedKey;
    });
  }

  // Asks, subscribes, and stores — in that order, stopping at the first
  // refusal. Resolves to a status string the UI can show.
  SYS.enablePush = function () {
    if (!supported()) return Promise.resolve("unsupported");
    return Notification.requestPermission()
      .then((permission) => {
        if (permission !== "granted") return permission === "denied" ? "denied" : "dismissed";
        return serverKey()
          .then((key) => navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()
            .then((existing) => existing || reg.pushManager.subscribe({
              // Required by every browser: a push may not be silent. This is
              // not a loophole to work around — a background ping nobody can
              // see is exactly what the permission exists to prevent.
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(key),
            }))))
          .then((sub) => storeSubscription(sub))
          .then(() => "enabled");
      })
      .catch((err) => {
        console.error("[push] enable failed", err);
        return "failed";
      });
  };

  function storeSubscription(sub) {
    if (!SYS.Cloud || !SYS.Cloud.savePushSubscription) return Promise.reject(new Error("Cloud sync isn't set up yet."));
    const json = sub.toJSON ? sub.toJSON() : {};
    const keys = json.keys || {};
    return SYS.Cloud.savePushSubscription(endpointId(sub.endpoint), {
      endpoint: sub.endpoint,
      p256dh: keys.p256dh || keyToBase64(sub.getKey("p256dh")),
      auth: keys.auth || keyToBase64(sub.getKey("auth")),
      // The server has no other way to know what "07:00" means to this
      // person. Stored per subscription rather than per account, because a
      // laptop and a phone can be in different places.
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC",
      ua: String(navigator.userAgent || "").slice(0, 200),
    });
  }

  // Unsubscribes this device and forgets it server-side. Permission itself is
  // the browser's to revoke — no page can hand it back — so the UI says so
  // rather than pretending this undoes everything.
  SYS.disablePush = function () {
    if (!supported()) return Promise.resolve("unsupported");
    return navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) return "off";
        const id = endpointId(sub.endpoint);
        return sub.unsubscribe()
          .then(() => (SYS.Cloud && SYS.Cloud.deletePushSubscription ? SYS.Cloud.deletePushSubscription(id) : null))
          .then(() => "off");
      })
      .catch((err) => {
        console.error("[push] disable failed", err);
        return "failed";
      });
  };

  // Whether this device currently holds a subscription. Checked rather than
  // remembered: the browser can drop one without telling the page, and a
  // switch that claims to be on when it is not is the worst of the three
  // states to be in.
  SYS.pushStatus = function () {
    if (!supported()) return Promise.resolve({ state: "unsupported" });
    if (Notification.permission !== "granted") return Promise.resolve({ state: Notification.permission });
    return navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => ({ state: sub ? "enabled" : "granted" }))
      .catch(() => ({ state: "failed" }));
  };
})(window.SYS = window.SYS || {});
