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
  // Popup, not redirect — signInWithRedirect was tried first (works fine in
  // an installed PWA window, in theory) but confirmed broken in real testing:
  // it relies on a cross-domain storage relay between the Firebase authDomain
  // (*.firebaseapp.com) and this app's own domain to hand back the result,
  // and modern Chrome's third-party storage restrictions silently break that
  // relay — no error, sign-in just never completes. Popup uses postMessage
  // between windows instead, which doesn't depend on that relay at all.
  function signInWithGoogle() {
    if (!auth) return Promise.reject(new Error("Cloud sync isn't set up yet."));
    return auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then((result) => result.user);
  }
  // Kept for backward compatibility with any stale in-flight redirect from
  // before the popup switch — always resolves quietly to null going forward.
  function checkRedirectResult() {
    if (!auth) return Promise.resolve(null);
    return auth.getRedirectResult().then((result) => (result && result.user) || null);
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

  // True only if a Cloud Function has actually stamped this account with the
  // admin custom claim (see functions/index.js setAdmin / scripts/bootstrap-
  // admin.js) — never inferred client-side. `forceRefresh` matters right
  // after a promotion: claims only appear in a freshly-issued ID token, so a
  // session that was already open won't see it until refreshed or re-issued.
  function checkIsAdmin(forceRefresh) {
    if (!auth || !currentUser) return Promise.resolve(false);
    return currentUser.getIdTokenResult(!!forceRefresh).then((res) => res.claims.admin === true);
  }

  // Every EXP an admin grants (mission approval, bonus/penalty) lands here
  // rather than being written into this user's own player.exp/level directly
  // — see firestore.rules and the plan doc for why (avoids racing push()).
  // Applying one is the caller's job (via SYS.applyExpDelta in engine.js,
  // exactly as if it were a normal quest); this just reads and clears them.
  function fetchPendingGrants() {
    if (!db || !currentUser) return Promise.resolve([]);
    return userDoc().collection("pendingGrants").get().then((snap) =>
      snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    );
  }
  function consumeGrant(grantId) {
    if (!db || !currentUser) return Promise.resolve();
    return userDoc().collection("pendingGrants").doc(grantId).delete();
  }

  // Admin-only: find a user's uid by email via the userDirectory mirror
  // (populated by the Auth onCreate trigger), then read their full doc.
  // Firestore rules enforce the admin check server-side regardless of what
  // this code does — these just fail with a permission error for non-admins.
  function findUserByEmail(email) {
    if (!db) return Promise.resolve(null);
    return db.collection("userDirectory").where("email", "==", email.trim()).limit(1).get()
      .then((snap) => (snap.empty ? null : { uid: snap.docs[0].id, ...snap.docs[0].data() }));
  }
  function fetchUserState(uid) {
    if (!db) return Promise.resolve(null);
    return db.collection("users").doc(uid).get().then((doc) => (doc.exists ? doc.data() : null));
  }

  // Missions — a user proposes one (status forced 'pending' by rules), an
  // admin approves (assigning points) or rejects it. Approval never grants
  // EXP directly; see pendingGrants above and functions/index.js.
  function createMissionSubmission(title, description) {
    if (!db || !currentUser) return Promise.reject(new Error("Sign in to submit a mission."));
    return db.collection("missionSubmissions").add({
      userId: currentUser.uid,
      title: title.trim(),
      description: (description || "").trim(),
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  function fetchMySubmissions() {
    if (!db || !currentUser) return Promise.resolve([]);
    return db.collection("missionSubmissions").where("userId", "==", currentUser.uid)
      .orderBy("createdAt", "desc").limit(50).get()
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  // Admin-only — Firestore rules enforce this server-side regardless.
  function fetchPendingMissions() {
    if (!db) return Promise.resolve([]);
    return db.collection("missionSubmissions").where("status", "==", "pending")
      .orderBy("createdAt", "asc").limit(100).get()
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  function callApproveMission(missionId, points) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("approveMission")({ missionId, points })
      .then((res) => res.data);
  }
  function callRejectMission(missionId) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("rejectMission")({ missionId })
      .then((res) => res.data);
  }

  // Inbox — admin-authored messages/bonuses/penalties. Read via Firestore
  // (rules already scope it to the owner); "read" is the one field the owner
  // may toggle themselves, so marking it read is a normal client write, not
  // a callable.
  function fetchInbox() {
    if (!db || !currentUser) return Promise.resolve([]);
    return userDoc().collection("inbox").orderBy("createdAt", "desc").limit(50).get()
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  function markInboxRead(msgId) {
    if (!db || !currentUser) return Promise.resolve();
    return userDoc().collection("inbox").doc(msgId).update({ read: true });
  }
  function callApplyAdjustment(targetUid, text, amount) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("applyAdjustment")({ targetUid, text, amount })
      .then((res) => res.data);
  }

  // Prices a quest/habit via the AI evaluator (functions/index.js). Requires
  // an account and a live connection by design — the value has to come from
  // the server or it isn't trustworthy. Callers must handle rejection: the
  // task form falls back to letting the user set the value themselves and
  // marks the task as self-priced.
  function callEvaluateTask(payload) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("evaluateTask")(payload)
      .then((res) => res.data);
  }

  // Callable Cloud Functions — thin wrappers, all server-side admin-checked
  // regardless of what this client code does (see functions/index.js).
  function callSetAdmin(email, makeAdmin) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("setAdmin")({ email, admin: makeAdmin })
      .then((res) => res.data);
  }
  // One-time-per-need maintenance action: fills in userDirectory entries for
  // any account that existed before the Cloud Functions were first deployed
  // (the onCreate trigger only covers signups from that point forward).
  function callBackfillUserDirectory() {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("backfillUserDirectory")({})
      .then((res) => res.data);
  }
  function callGetAdminStatus(uid) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("getAdminStatus")({ uid })
      .then((res) => res.data);
  }

  SYS.Cloud = {
    available, init, onAuthChange,
    signUp, signIn, signOut: signOutUser,
    signInWithGoogle, checkRedirectResult,
    sendPasswordReset, sendVerificationEmail, reloadUser,
    pull, push, pullIfNewer,
    checkIsAdmin, fetchPendingGrants, consumeGrant,
    findUserByEmail, fetchUserState, callSetAdmin, callBackfillUserDirectory, callGetAdminStatus,
    createMissionSubmission, fetchMySubmissions, fetchPendingMissions, callApproveMission, callRejectMission,
    fetchInbox, markInboxRead, callApplyAdjustment, callEvaluateTask,
    currentUser: () => currentUser,
  };
})(window.SYS = window.SYS || {});
