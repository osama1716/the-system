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

  // Every push has three silent exits — no signed-in user, a debounce that
  // cancels the previous one, and a write that never resolves — and all three
  // look identical from the app: everything keeps working and nothing is
  // saved. The account this was found on had not been written for two and a
  // half weeks without one error being raised. So each attempt records what
  // became of it.
  const pushStats = { asked: 0, skippedNoUser: 0, superseded: 0, started: 0, ok: 0, failed: 0, lastError: null, lastOkAt: null };

  // Sends why a save was refused to the server log (reportSaveFailure in
  // functions/index.js), once per session. The refusal happens between this
  // browser and the database, so without this the only trace of it is the
  // notice on this screen. Sizes and counts only — nothing that was written.
  let saveFailureReported = false;
  function reportSaveFailure(err, state) {
    if (saveFailureReported || !app || typeof firebase.functions !== "function") return;
    saveFailureReported = true;
    try {
      const kb = (v) => Math.round(new Blob([JSON.stringify(v === undefined ? null : v)]).size / 1024);
      const sizesKB = {};
      Object.keys(state || {}).forEach((k) => { sizesKB[k] = kb(state[k]); });
      const len = (v) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0);
      const counts = {
        tasks: len(state.tasks), levelHistory: len(state.levelHistory), log: len(state.log),
        intTypes: len(state.intTypes), dailyStats: len(state.dailyStats),
      };
      firebase.app().functions("us-central1").httpsCallable("reportSaveFailure")({
        code: (err && err.code) || "", message: (err && err.message) || String(err),
        totalKB: kb(state), sizesKB, counts,
      }).catch(() => {});
    } catch (e) { /* reporting must never break saving */ }
  }

  // A save this device asked for and has not seen land, remembered across a
  // reload as the time of the first change it holds.
  //
  // A save waits 900 ms so a burst of changes becomes one write, and a reload
  // inside that wait used to keep the change on this device and lose it from
  // the account — the next launch then found two copies that differed and
  // asked which one to keep, when one of them was simply newer. main.js reads
  // this to tell that case from a real conflict, and flushes the wait when
  // the page is hidden or closing. Per account, so another sign-in on the
  // same device cannot inherit it.
  let askedSeq = 0;
  let queuedState = null;
  function unsavedKey() { return currentUser ? "the-system:unsavedSince:" + currentUser.uid : null; }
  function markUnsaved() {
    const key = unsavedKey();
    if (!key) return;
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, String(Date.now())); } catch (e) { /* storage blocked: nothing to remember with */ }
  }
  function clearUnsaved() {
    const key = unsavedKey();
    if (!key) return;
    try { localStorage.removeItem(key); } catch (e) { /* see markUnsaved */ }
  }
  function unsavedSince() {
    const key = unsavedKey();
    if (!key) return null;
    try { const v = Number(localStorage.getItem(key)); return v > 0 ? v : null; } catch (e) { return null; }
  }

  // Whether this device has ever been in step with this account: a save of
  // its landed, or it took the account's copy. Until it has, a difference
  // between the two can be edits made here while signed out, and taking the
  // account's copy silently would drop them. After it has, and with nothing
  // unsaved here, a difference only means another device moved on.
  function syncedHereKey() { return currentUser ? "the-system:syncedHere:" + currentUser.uid : null; }
  function markSyncedHere() {
    const key = syncedHereKey();
    if (!key) return;
    try { localStorage.setItem(key, "1"); } catch (e) { /* storage blocked */ }
  }
  function hasSyncedHere() {
    const key = syncedHereKey();
    if (!key) return false;
    try { return localStorage.getItem(key) === "1"; } catch (e) { return false; }
  }

  // What to do when this device's copy and the account's differ.
  //
  // It used to decide from the EXP journal alone, and so asked "which copy do
  // you want to keep?" on every switch between a phone and a laptop: after a
  // change on the phone, the laptop's copy no longer matched the journal (or
  // both did), and neither case was allowed to resolve itself. The question
  // that settles almost every case is whether this device holds anything the
  // account has not got. If it does not, the account is simply ahead.
  //
  //   journalKnown   the EXP journal could be read
  //   localMatches   this device's total agrees with it
  //   cloudMatches   the account copy's total agrees with it
  //   deviceIsNewer  this device holds an unsaved change made after the
  //                  account copy was last written
  //   deviceBehind   this device holds nothing unsaved and has been in step
  //                  with this account before
  //
  // Returns "take-cloud", "push-local" or "ask". The journal still overrules
  // a copy it contradicts, since it is the record EXP is audited against.
  function decideSync(input) {
    const i = input || {};
    if (!i.journalKnown) return i.deviceBehind ? "take-cloud" : "ask";
    if (i.localMatches && !i.cloudMatches) return "push-local";
    if (!i.localMatches && i.cloudMatches) return i.deviceBehind ? "take-cloud" : "ask";
    if (i.localMatches && i.cloudMatches) return i.deviceIsNewer ? "push-local" : i.deviceBehind ? "take-cloud" : "ask";
    return "ask";
  }

  function push(state) {
    pushStats.asked++;
    if (!db || !currentUser) { pushStats.skippedNoUser++; return; }
    askedSeq++;
    queuedState = state;
    markUnsaved();
    if (pushTimer) { clearTimeout(pushTimer); pushStats.superseded++; }
    // Short: another device is watching live, and a change should reach it
    // about as fast as it is made. Long enough still to fold a quick run of
    // taps into one write.
    pushTimer = setTimeout(() => { pushTimer = null; writeNow(state); }, 200);
  }

  // Sends a save that is still in its wait, now. For a page being hidden or
  // unloaded, which is exactly when the wait lost it.
  function flushPush() {
    if (!pushTimer || !queuedState || !db || !currentUser) return;
    clearTimeout(pushTimer);
    pushTimer = null;
    writeNow(queuedState);
  }

  // ---------- merging with the account's copy ----------
  //
  // `base` is the last copy this device knows the account held — written by
  // it, or received from it. Two copies are merged against it
  // (js/state-merge.js) instead of one replacing the other. Kept per account.
  function baseKey() { return currentUser ? "the-system:syncBase:" + currentUser.uid : null; }
  function getBase() {
    const key = baseKey();
    if (!key) return null;
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function setBase(saved) {
    const key = baseKey();
    if (!key || !saved) return;
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) { /* storage full or blocked: merging falls back to asking */ }
  }

  // What this device wrote recently, so its own writes coming back through
  // the listener are not mistaken for another device's.
  const same = (a, b) => (SYS.deepEqual ? SYS.deepEqual(a, b) : JSON.stringify(a) === JSON.stringify(b));
  let recentWrites = [];
  function rememberWrite(saved) {
    recentWrites = [saved].concat(recentWrites.filter((x) => !same(x, saved))).slice(0, 4);
  }
  function isOwnWrite(remote) { return recentWrites.some((x) => same(x, remote)); }

  let mergeHandler = null;      // (base, local, remote) -> { state, standingConflict }
  let mergedWriteHandler = null; // (written, whatWasSent, standingConflict)

  // The state without the planner, as JSON: what is actually stored.
  function storable(state) {
    const { planner, ...saved } = state || {};
    return JSON.parse(JSON.stringify(saved));
  }

  function writeNow(state) {
    const seq = askedSeq;
    pushStats.started++;
    // Firestore refuses a whole document over a single `undefined`, and the
    // compat SDK refuses it by *throwing* rather than rejecting — so the copy
    // goes through JSON, which drops exactly what Firestore cannot take. The
    // planner is not part of it: it syncs item by item (js/planner-sync.js).
    let saved;
    try {
      saved = storable(state);
    } catch (e) {
      failed(e, state);
      return;
    }
    const ref = userDoc();
    const base = getBase();
    // Read and write in one transaction. If another device wrote since this
    // one last synced, its changes are merged in before writing, rather than
    // overwritten — two saves a moment apart used to lose one of them.
    db.runTransaction((tx) => tx.get(ref).then((snap) => {
      const remote = snap.exists ? ((snap.data() || {}).state || null) : null;
      let toWrite = saved;
      let merged = null;
      if (remote && base && mergeHandler && !same(remote, base) && !same(remote, saved)) {
        merged = mergeHandler(base, saved, remote);
        toWrite = JSON.parse(JSON.stringify(merged.state));
      }
      rememberWrite(toWrite);
      tx.set(ref, { state: toWrite, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return { toWrite, merged };
    }))
      .then(({ toWrite, merged }) => {
        // Only the newest save clears the mark: an older one landing while a
        // newer one is still waiting or in flight has not saved everything.
        if (seq === askedSeq && !pushTimer) clearUnsaved();
        markSyncedHere();
        setBase(toWrite);
        pushStats.ok++;
        pushStats.lastOkAt = Date.now();
        if (merged && mergedWriteHandler) mergedWriteHandler(toWrite, saved, merged.standingConflict);
      })
      .catch((e) => {
        // Offline is not a failure worth a notice: a transaction cannot wait
        // for the network the way a plain write did, so it is simply tried
        // again when the connection comes back.
        if ((e && e.code === "unavailable") || (typeof navigator !== "undefined" && navigator.onLine === false)) {
          retryWhenOnline();
          return;
        }
        failed(e, state);
      });
  }

  function failed(e, state) {
    pushStats.failed++;
    pushStats.lastError = (e && (e.code || e.message)) || "unknown";
    console.warn("[TheSystem] cloud push failed", e);
    reportSaveFailure(e, state);
    if (onPushError) onPushError(e);
  }

  let retryArmed = false;
  function retryWhenOnline() {
    if (retryArmed) return;
    retryArmed = true;
    const again = () => {
      retryArmed = false;
      window.removeEventListener("online", again);
      if (queuedState && db && currentUser) writeNow(queuedState);
    };
    window.addEventListener("online", again);
    // Some browsers report "online" while the database is still out of reach.
    setTimeout(() => { if (retryArmed) again(); }, 30000);
  }

  // The account's copy, live. Called with each copy written by another
  // device; this device's own writes are recognised and passed over.
  function watchState(onRemote) {
    if (!db || !currentUser) return () => {};
    return userDoc().onSnapshot((doc) => {
      if (doc.metadata.hasPendingWrites || !doc.exists) return;
      const data = doc.data() || {};
      if (data.updatedAt) lastSyncedAt = data.updatedAt;
      if (!data.state || isOwnWrite(data.state)) return;
      onRemote(data.state);
    }, () => {});
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
  // The same collection, live. It is empty almost all the time — a grant is
  // written by an admin and deleted by this device moments later — so
  // listening costs nothing until there is something to apply, and a
  // corrected value shows up on an open app the moment it is decided rather
  // than the next time the app is brought back to the front.
  function watchPendingGrants(onGrants) {
    if (!db || !currentUser) return () => {};
    return userDoc().collection("pendingGrants").onSnapshot(
      (snap) => onGrants(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
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
      // So a resolved appeal can move the recorded price the server pays
      // from, not only the number on this device.
      priceId: task.priceId || null,
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
  // The reflection question — see functions/reflection.js.
  function callableOf(name) {
    if (!app || typeof firebase.functions !== "function") return null;
    return firebase.app().functions("us-central1").httpsCallable(name);
  }
  function callSubmitReflection(priceId, checkpoint, answer) {
    const fn = callableOf("submitReflection");
    if (!fn) return Promise.reject(new Error("Cloud sync isn't set up yet."));
    const lang = SYS.currentLanguage ? SYS.currentLanguage() : "en";
    return fn({ priceId, checkpoint, answer, lang }).then((res) => res.data);
  }
  function callReflectionStatus(priceIds) {
    const fn = callableOf("reflectionStatus");
    if (!fn) return Promise.reject(new Error("Cloud sync isn't set up yet."));
    return fn({ priceIds }).then((res) => res.data);
  }
  function callReviewReflection(id, accept) {
    const fn = callableOf("reviewReflection");
    if (!fn) return Promise.reject(new Error("Cloud sync isn't set up yet."));
    return fn({ id, accept }).then((res) => res.data);
  }
  // Admin only. Accounts the suspicion check has flagged — see
  // functions/suspicion.js. An account an admin already looked at drops out,
  // unless evidence newer than that look has arrived since.
  function fetchFlaggedAccounts() {
    if (!db) return Promise.resolve([]);
    // A FieldPath rather than the dotted string: the same query, and it keeps
    // the static audit from reading a field path as a translation key.
    return db.collection("suspicion").where(new firebase.firestore.FieldPath("flag", "flagged"), "==", true).limit(100).get()
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) => {
          const f = a.flag || {};
          const seen = Number(f.reviewedAt) || 0;
          return !seen || (f.reasons || []).some((r) => (Number(r.evidenceAt) || 0) > seen);
        }));
  }
  function callReviewSuspicion(uid, restore) {
    const fn = callableOf("reviewSuspicion");
    if (!fn) return Promise.reject(new Error("Cloud sync isn't set up yet."));
    return fn({ uid, restore }).then((res) => res.data);
  }
  // Admin only — the rules refuse anybody else. Sorted here rather than in
  // the query, so no composite index is needed for an admin-sized list.
  function fetchHeldReflections() {
    if (!db) return Promise.resolve([]);
    return db.collection("reflections").where("status", "==", "held").limit(100).get()
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (Number(a.heldAt) || 0) - (Number(b.heldAt) || 0)));
  }
  // When each of these tasks can next be recorded. The server works it out and
  // sends the moment only — never the estimated hours behind it, which would
  // tell somebody exactly what to claim. See unlockTimes in functions/index.js.
  function callUnlockTimes(priceIds) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    let tz = "UTC";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) {}
    return firebase.app().functions("us-central1")
      .httpsCallable("unlockTimes")({ priceIds, tz })
      .then((res) => res.data);
  }
  // What happened to priced tasks — "at 60%", "done on the 14th" — for the
  // server to turn into EXP. See recordProgress in functions/index.js. The
  // zone goes with it so the server knows which day is today for this person.
  function callRecordProgress(reports) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    let tz = "UTC";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) {}
    return firebase.app().functions("us-central1")
      .httpsCallable("recordProgress")({ reports, tz })
      .then((res) => res.data);
  }
  // Admin only: every appeal, anonymised, to the evaluator's log for improving
  // it — see exportAppealsForEval in functions/index.js.
  function callExportAppealsForEval() {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("exportAppealsForEval")()
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

  // Reminders. The subscription is this device's address on a push service:
  // useless to anyone else, but it is the thing the server needs in order to
  // reach the person, so it lives under their own document.
  function savePushSubscription(id, data) {
    if (!db || !currentUser) return Promise.reject(new Error("Not signed in."));
    return db.collection("users").doc(currentUser.uid).collection("pushSubs").doc(id).set({
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  function deletePushSubscription(id) {
    if (!db || !currentUser) return Promise.resolve();
    return db.collection("users").doc(currentUser.uid).collection("pushSubs").doc(id).delete();
  }
  function callPushConfig() {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1").httpsCallable("pushConfig")().then((res) => res.data);
  }
  function callSendTestPush() {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1").httpsCallable("sendTestPush")().then((res) => res.data);
  }

  // The library sends an id and gets back what that habit is worth. The price
  // is the server's to decide — see priceLibraryHabit in functions/index.js.
  function callPriceLibraryHabit(payload) {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("priceLibraryHabit")(payload)
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
  function callBackfillExpBaselines() {
    if (!app || typeof firebase.functions !== "function") {
      return Promise.reject(new Error("Cloud sync isn't set up yet."));
    }
    return firebase.app().functions("us-central1")
      .httpsCallable("backfillExpBaselines")({})
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

  // ---------- public profiles (functions/profile.js) ----------
  function fetchProfile(uid) {
    if (!db || !currentUser) return Promise.resolve(null);
    return Promise.all([
      db.collection("profiles").doc(uid).get(),
      db.collection("leaderboard").doc(uid).get(),
    ]).then(([p, row]) => ({
      uid,
      profile: p.exists ? p.data() : {},
      row: row.exists ? { uid, ...row.data() } : null,
    }));
  }
  function callable(name, data) {
    if (!app || typeof firebase.functions !== "function") return Promise.reject(new Error("Cloud sync isn't set up yet."));
    return firebase.app().functions("us-central1").httpsCallable(name)(data).then((res) => res.data);
  }
  const callUpdateProfile = (data) => callable("updateProfile", data);
  const callReportUser = (data) => callable("reportUser", data);
  const callReviewReport = (id, action) => callable("reviewReport", { id, action });
  function fetchOpenReports() {
    if (!db) return Promise.resolve([]);
    return db.collection("userReports").where("status", "==", "open").limit(100).get()
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => ((a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0) - (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0))));
  }
  function fetchBlocks() {
    if (!db || !currentUser) return Promise.resolve([]);
    return userDoc().collection("blocks").get().then((snap) => snap.docs.map((d) => d.id));
  }
  function setBlocked(uid, blocked) {
    if (!db || !currentUser) return Promise.reject(new Error("Not signed in."));
    const ref = userDoc().collection("blocks").doc(uid);
    return blocked ? ref.set({ at: firebase.firestore.FieldValue.serverTimestamp() }) : ref.delete();
  }

  // ---------- planner items (see js/planner-sync.js) ----------
  function plannerCol() { return userDoc().collection("plannerItems"); }

  function writePlannerItems(items) {
    if (!db || !currentUser) return Promise.reject(new Error("Not signed in."));
    try {
      const batch = db.batch();
      items.forEach((it) => {
        batch.set(plannerCol().doc(it.id), {
          kind: it.kind,
          // Through JSON for the same reason as the state save: Firestore
          // throws on `undefined`, and a tombstone has no data at all.
          data: it.deleted ? {} : JSON.parse(JSON.stringify(it.data || {})),
          u: Math.round(Number(it.u) || 0),
          deleted: !!it.deleted,
          s: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });
      return batch.commit();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // Everything changed after `cursorMs` (server time), and every change from
  // then on while it is open. A change still being written by this device
  // is marked `pending`; its server time is only an estimate until it lands.
  function watchPlannerItems(cursorMs, onDocs, onError) {
    if (!db || !currentUser) return null;
    let q = plannerCol();
    if (cursorMs > 0) q = q.where("s", ">", firebase.firestore.Timestamp.fromMillis(cursorMs));
    return q.onSnapshot((snap) => {
      const docs = [];
      snap.docChanges().forEach((ch) => {
        if (ch.type === "removed") return;
        const d = ch.doc.data({ serverTimestamps: "estimate" }) || {};
        docs.push({
          id: ch.doc.id, kind: d.kind, data: d.data || null, u: Number(d.u) || 0, deleted: !!d.deleted,
          s: d.s && d.s.toMillis ? d.s.toMillis() : 0, pending: ch.doc.metadata.hasPendingWrites,
        });
      });
      // Called even when nothing changed: the first answer is what tells the
      // planner the server has been heard from.
      onDocs(docs);
    }, onError);
  }

  SYS.Cloud = {
    available, init, onAuthChange,
    signUp, signIn, signOut: signOutUser,
    signInWithGoogle, checkRedirectResult,
    sendPasswordReset, sendVerificationEmail, reloadUser,
    pull, push, pullIfNewer, flushPush, unsavedSince, clearUnsaved, markSyncedHere, hasSyncedHere, decideSync,
    checkIsAdmin, fetchPendingGrants, consumeGrant, watchPendingGrants,
    findUserByEmail, fetchUserState, callSetAdmin, callBackfillUserDirectory, callGetAdminStatus,
    createAppeal, fetchMyAppeals, fetchPendingAppeals, callResolveAppeal, callRejectAppeal, callExportAppealsForEval,
    callClaimUsername, callCheckUsername, callLookupUser, callResolveUsers,
    callBackfillUsernames, callBackfillLeaderboard, callBackfillExpBaselines, callSuggestQuests, traitsForEvaluation, isMyNameClaimed,
    fetchInbox, markInboxRead, callApplyAdjustment, callEvaluateTask, callPriceLibraryHabit,
    savePushSubscription, deletePushSubscription, callPushConfig, callSendTestPush,
    fetchLeaderboard, fetchMyLeaderboardEntry, fetchMyRank, appendExpEvents, fetchExpSummary, callRecordProgress, callUnlockTimes,
    callSubmitReflection, callReflectionStatus, callReviewReflection, fetchHeldReflections,
    fetchFlaggedAccounts, callReviewSuspicion,
    writePlannerItems, watchPlannerItems,
    fetchProfile, callUpdateProfile, callReportUser, callReviewReport, fetchOpenReports, fetchBlocks, setBlocked,
    watchState, getBase, setBase: (state) => setBase(storable(state)),
    setMergeHandler(fn) { mergeHandler = fn; },
    setMergedWriteHandler(fn) { mergedWriteHandler = fn; },
    setPushErrorHandler(fn) { onPushError = fn; },
    pushStats: () => ({ ...pushStats }),
    // When the stored copy was last written, so "nothing is landing" can be
    // told apart from "the other device is simply behind".
    storedUpdatedAt: () => (lastSyncedAt && lastSyncedAt.toMillis ? lastSyncedAt.toMillis() : null),
    currentUser: () => currentUser,
  };
})(window.SYS = window.SYS || {});
