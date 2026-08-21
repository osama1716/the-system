// Optional cloud sync (Firebase Auth + Firestore). Everything here degrades
// gracefully to a no-op if firebase-config.js still has placeholder values
// or the Firebase SDK failed to load (e.g. offline) — the app works exactly
// as before, fully local, whether or not this is ever configured.
(function (SYS) {
  "use strict";

  let app = null, auth = null, db = null;
  let currentUser = null;
  let lastSyncedAt = null; // Firestore Timestamp of the version we last pushed/pulled
  let authChangeCallback = null;
  let pushTimer = null;

  function configured() {
    const c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.apiKey !== "PASTE_ME");
  }

  function available() {
    return configured() && typeof window.firebase !== "undefined";
  }

  function appCheckConfigured() {
    const k = window.FIREBASE_APPCHECK_SITE_KEY;
    return !!(k && k !== "PASTE_ME");
  }

  function init() {
    if (!available() || app) return;
    try {
      app = firebase.initializeApp(window.FIREBASE_CONFIG);
      // Optional, independently of everything else here: if a real App Check
      // site key has been configured, activate it so Auth/Firestore requests
      // carry a verified-app token. Left unconfigured, this is a silent no-op
      // and the app behaves exactly as before.
      if (appCheckConfigured() && firebase.appCheck) {
        try {
          firebase.appCheck().activate(window.FIREBASE_APPCHECK_SITE_KEY, true);
        } catch (e) {
          console.warn("[TheSystem] App Check init failed", e);
        }
      }
      auth = firebase.auth();
      db = firebase.firestore();
      auth.onAuthStateChanged((user) => {
        currentUser = user;
        if (authChangeCallback) authChangeCallback(user);
      });
    } catch (e) {
      console.warn("[TheSystem] Firebase init failed", e);
      app = null; auth = null; db = null;
    }
  }

  function onAuthChange(cb) { authChangeCallback = cb; }

  function userDoc() { return db.collection("users").doc(currentUser.uid); }

  function signUp(email, password) {
    if (!auth) return Promise.reject(new Error("Cloud sync isn't set up yet."));
    return auth.createUserWithEmailAndPassword(email, password).then((cred) => {
      // Best-effort — a verification email failing to send shouldn't block
      // account creation or sync, so this is never allowed to reject signUp.
      if (cred.user) cred.user.sendEmailVerification().catch(() => {});
      return cred;
    });
  }
  function signIn(email, password) {
    if (!auth) return Promise.reject(new Error("Cloud sync isn't set up yet."));
    return auth.signInWithEmailAndPassword(email, password);
  }
  function signOutUser() {
    lastSyncedAt = null;
    if (!auth) return Promise.resolve();
    return auth.signOut();
  }
  function sendPasswordReset(email) {
    if (!auth) return Promise.reject(new Error("Cloud sync isn't set up yet."));
    return auth.sendPasswordResetEmail(email);
  }
  function sendVerificationEmail() {
    if (!auth || !currentUser) return Promise.reject(new Error("Not signed in."));
    return currentUser.sendEmailVerification();
  }
  function reloadUser() {
    if (!auth || !currentUser) return Promise.resolve(null);
    return currentUser.reload().then(() => currentUser);
  }

  // One-time pull, used right after sign-in to decide how to reconcile.
  function pull() {
    if (!db || !currentUser) return Promise.resolve(null);
    return userDoc().get().then((doc) => {
      if (!doc.exists) return null;
      const data = doc.data();
      lastSyncedAt = data.updatedAt || null;
      return data.state || null;
    });
  }

  // Debounced push — safe to call after every local state change; rapid
  // successive changes collapse into one write.
  function push(state) {
    if (!db || !currentUser) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      userDoc().set({ state, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => userDoc().get())
        .then((doc) => { if (doc.exists) lastSyncedAt = doc.data().updatedAt || lastSyncedAt; })
        .catch((e) => console.warn("[TheSystem] cloud push failed", e));
    }, 900);
  }

  // "Cloud wins if it's newer than what we last synced" — meant to be called
  // when the tab/app regains focus. This is what makes "did something on my
  // phone, now I'm on my laptop" actually show up, without keeping a
  // persistent live connection open the whole time the app is open.
  function pullIfNewer() {
    if (!db || !currentUser) return Promise.resolve(null);
    return userDoc().get().then((doc) => {
      if (!doc.exists) return null;
      const data = doc.data();
      const remoteMs = data.updatedAt ? data.updatedAt.toMillis() : 0;
      const localMs = lastSyncedAt ? lastSyncedAt.toMillis() : 0;
      if (remoteMs > localMs) {
        lastSyncedAt = data.updatedAt;
        return data.state || null;
      }
      return null;
    });
  }

  SYS.Cloud = {
    available, init, onAuthChange,
    signUp, signIn, signOut: signOutUser,
    sendPasswordReset, sendVerificationEmail, reloadUser,
    pull, push, pullIfNewer,
    currentUser: () => currentUser,
  };
})(window.SYS = window.SYS || {});
