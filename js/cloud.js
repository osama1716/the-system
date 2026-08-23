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
  // Set by main.js. A save that fails has to be visible: this one was only
  // warned about in a console, so when the rules started rejecting saves the
  // app carried on looking fine — the device moved ahead, the account stood
  // still, and the only symptom was a "which copy do you want to keep?" prompt
  // on every launch, which reads as a sync quirk rather than as nothing having
  // been saved for days.
  let onPushError = null;

  function push(state) {
    if (!db || !currentUser) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      userDoc().set({ state, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => userDoc().get())
        .then((doc) => { if (doc.exists) lastSyncedAt = doc.data().updatedAt || lastSyncedAt; })
        .catch((e) => {
          console.warn("[TheSystem] cloud push failed", e);
          if (onPushError) onPushError(e);
        });
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

  // Every EXP an admin authorizes (appeal correction, bonus/penalty) lands here
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

  // Appeals — the human review path over the automatic evaluator. A user
  // disputes the value one of their tasks was given; an admin looks again
  // and either upholds it or sets a corrected value. Resolution never grants
  // EXP directly; see pendingGrants above and functions/index.js.
  function createAppeal(task, reason) {
    if (!db || !currentUser) return Promise.reject(new Error("Sign in to appeal a value."));
    return db.collection("appeals").add({
      userId: currentUser.uid,
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.notes || "",
      taskKind: task.recurring ? "habit" : "quest",
      currentPt: task.pt,
      reason: reason.trim(),
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  function fetchMyAppeals() {
    if (!db || !currentUser) return Promise.resolve([]);
    return db.collection("appeals").where("userId", "==", currentUser.uid)
      .orderBy("createdAt", "desc").limit(50).get()
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  // Admin-only — Firestore rules enforce this server-side regardless.
  function fetchPendingAppeals() {
    if (!db) return Promise.resolve([]);
    return db.collection("appeals").where("status", "==", "pending")
      .orderBy("createdAt", "asc").limit(100).get()
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  function callResolveAppeal(appealId, newPt) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("resolveAppeal")({ appealId, newPt })
      .then((res) => res.data);
  }
  function callRejectAppeal(appealId) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("rejectAppeal")({ appealId })
      .then((res) => res.data);
  }

  // Append-only record of every EXP movement, which is what the public
  // standing is actually computed from — see functions/index.js. The rules let
  // this collection be added to and never edited or deleted, so a number that
  // has been reported cannot later be quietly revised.
  //
  // Written in batches because an offline stretch produces a backlog, and 400
  // separate writes for one reconnect would be both slow and needlessly
  // expensive. 500 is Firestore's own limit on a batch.
  function appendExpEvents(events) {
    if (!db || !currentUser || !events || !events.length) return Promise.resolve(0);
    const chunks = [];
    for (let i = 0; i < events.length; i += 400) chunks.push(events.slice(i, i + 400));
    const col = userDoc().collection("expEvents");
    return chunks.reduce(
      (chain, chunk) => chain.then(() => {
        const batch = db.batch();
        chunk.forEach((e) => {
          const entry = {
            delta: e.delta,
            source: e.source,
            // Stamped by the server, not the device: a local clock is
            // adjustable, and the ordering of this record is part of what
            // makes it worth keeping.
            at: firebase.firestore.FieldValue.serverTimestamp(),
          };
          if (e.priceId) entry.priceId = e.priceId;
          batch.set(col.doc(), entry);
        });
        return batch.commit();
      }),
      Promise.resolve()
    ).then(() => events.length);
  }

  // Everything the journal knows about this account, in one read: what it is
  // worth, and what it earned each month. Two callers want different halves of
  // it and there is no reason to fetch the same document twice.
  function fetchExpSummary() {
    if (!db || !currentUser) return Promise.resolve(null);
    return db.collection("expTotals").doc(currentUser.uid).get().then((doc) => {
      if (!doc.exists) return null;
      const d = doc.data();
      return {
        // No baseline yet means this account has never been mirrored, so there
        // is no authoritative figure to correct towards — only a partial one,
        // and correcting to a partial total would delete real progress.
        total: typeof d.baseline === "number" ? (Number(d.baseline) || 0) + (Number(d.journalExp) || 0) : null,
        months: d.months && typeof d.months === "object" ? d.months : {},
      };
    });
  }

  // Global ranking. leaderboard/{uid} is a public projection of users/{uid}
  // written only by a Cloud Function trigger (see functions/index.js), so
  // everything here is read-only — there is no client write path to a score.
  //
  // Only the top slice is fetched: a leaderboard is a page you look at, not a
  // copy of every account in the project, and the cost of reading it grows
  // with the number of rows pulled.
  const LEADERBOARD_PAGE = 100;
  function fetchLeaderboard(limit) {
    if (!db || !currentUser) return Promise.resolve([]);
    const n = Math.max(1, Math.min(Number(limit) || LEADERBOARD_PAGE, 250));
    return db.collection("leaderboard").orderBy("totalExp", "desc").limit(n).get()
      .then((snap) => snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
  }
  // This account's own row, so someone outside the top slice still sees their
  // own numbers instead of an empty page.
  function fetchMyLeaderboardEntry() {
    if (!db || !currentUser) return Promise.resolve(null);
    return db.collection("leaderboard").doc(currentUser.uid).get()
      .then((doc) => (doc.exists ? { uid: doc.id, ...doc.data() } : null));
  }
  // Position for someone who fell outside the fetched page.
  //
  // The obvious tool is a count() aggregation, which the server answers
  // without sending any documents — but it does not exist in the compat SDK
  // (checked: undefined in 10.14.1) and this app loads Firebase through plain
  // <script> tags, so the modular build that has it is not an option. The web
  // SDK has no projection either, so the only way to count the players above
  // someone is to actually fetch their rows.
  //
  // That is cheap for a board of hundreds and wasteful for one of hundreds of
  // thousands, so it stops at a cap and reports "500+" instead of scanning
  // without bound. This only ever runs for a player outside the top 100 — on a
  // board smaller than that it never runs at all.
  //
  // Counting strictly-greater and adding one means equal totals share a
  // position (1, 2, 2, 4) — the same competition ranking the list itself uses.
  const RANK_SCAN_CAP = 500;
  function fetchMyRank(totalExp) {
    if (!db || !currentUser || typeof totalExp !== "number") return Promise.resolve(null);
    return db.collection("leaderboard").where("totalExp", ">", totalExp)
      .limit(RANK_SCAN_CAP + 1).get()
      .then((snap) => (snap.size > RANK_SCAN_CAP ? RANK_SCAN_CAP + "+" : snap.size + 1))
      .catch(() => null);
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
  // The evaluator picks the trait a point lands in, so it needs this account's
  // actual traits — sent live rather than read from the stored profile, which
  // is only ever as current as the last successful save.
  function traitsForEvaluation(state) {
    const types = Array.isArray(state && state.intTypes) ? state.intTypes : [];
    return types.slice(0, 20).map((c) => ({
      key: c.key,
      names: (((state.intelligences || {})[c.key] || {}).traits || []).slice(0, 12).map((t) => String(t.name).slice(0, 50)),
    }));
  }

  function callEvaluateTask(payload) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("evaluateTask")(payload)
      .then((res) => res.data);
  }

  // Display names are unique, so claiming one is a server operation — see
  // functions/index.js. The check is only a preview; the claim is what decides.
  function callClaimUsername(name) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("claimUsername")({ name })
      .then((res) => res.data);
  }
  function callCheckUsername(name) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("checkUsername")({ name })
      .then((res) => res.data);
  }
  function callLookupUser(query) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("lookupUser")({ query })
      .then((res) => res.data);
  }
  // This week's proposed tasks. Server-cached per week, so calling it on every
  // visit to the page costs a document read, not an evaluation.
  function callSuggestQuests() {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("suggestQuests")({})
      .then((res) => res.data);
  }
  function callBackfillLeaderboard() {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("backfillLeaderboard")({})
      .then((res) => res.data);
  }
  function callBackfillUsernames() {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("backfillUsernames")({})
      .then((res) => res.data);
  }
  // Whether this account actually holds its current name. Accounts that
  // predate unique names have one locally that was never reserved, so the
  // rename field needs to say so rather than look settled.
  function isMyNameClaimed(name) {
    if (!db || !currentUser || typeof name !== "string" || !name.trim()) return Promise.resolve(false);
    const key = name.trim().toLowerCase().replace(/\s+/g, " ");
    return db.collection("usernames").doc(key).get()
      .then((doc) => doc.exists && doc.data().uid === currentUser.uid)
      .catch(() => false);
  }
  function callResolveUsers(uids) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("resolveUsers")({ uids })
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
    createAppeal, fetchMyAppeals, fetchPendingAppeals, callResolveAppeal, callRejectAppeal,
    callClaimUsername, callCheckUsername, callLookupUser, callResolveUsers,
    callBackfillUsernames, callBackfillLeaderboard, callSuggestQuests, traitsForEvaluation, isMyNameClaimed,
    fetchInbox, markInboxRead, callApplyAdjustment, callEvaluateTask,
    fetchLeaderboard, fetchMyLeaderboardEntry, fetchMyRank, appendExpEvents, fetchExpSummary,
    setPushErrorHandler(fn) { onPushError = fn; },
    currentUser: () => currentUser,
  };
})(window.SYS = window.SYS || {});
