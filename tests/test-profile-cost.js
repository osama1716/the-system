// A free account is given nothing that costs (his rule, 2026-10-22):
//   node tests/test-profile-cost.js
//
// Saving a profile is free — the avatar, clearing the bio, keeping it as it is
// — except a new bio, which Claude reads before anyone sees it. So a new bio
// needs a subscription or the trial, and a refused one never reaches Claude.
// Played against the real updateProfile on an in-memory Firestore, with the
// Claude client stood in for and every call to it counted.
"use strict";
const Module = require("module");
const path = require("path");

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };
const REPO = path.resolve(__dirname, "..");

const DEL = { del: true }, TS = { ts: true };
const store = new Map();
const docRef = (p) => ({
  get: async () => ({ exists: store.has(p), data: () => (store.has(p) ? { ...store.get(p) } : undefined) }),
  set: async (d, o) => {
    const out = o && o.merge && store.has(p) ? { ...store.get(p) } : {};
    for (const [k, v] of Object.entries(d)) { if (v === DEL) delete out[k]; else if (v === TS) out[k] = Date.now(); else out[k] = v; }
    store.set(p, out);
  },
});
let createdAt = Date.now(), subscribed = false, aiCalls = 0;
const firestore = () => ({
  collection: (c) => ({ doc: (id) => (c === "subscriptions" ? { get: async () => ({ exists: subscribed, data: () => ({ active: true }) }) } : docRef(c + "/" + id)) }),
});
firestore.FieldValue = { delete: () => DEL, serverTimestamp: () => TS, increment: (n) => n };
class Anthropic {
  constructor() { this.messages = { create: async () => { aiCalls++; return { model: "claude-haiku-4-5", usage: { input_tokens: 300, output_tokens: 20 }, content: [{ type: "text", text: '{"allowed":true,"reason":""}' }] }; } }; }
}
class HttpsError extends Error { constructor(c, m, d) { super(m); this.code = c; this.details = d; } }
const stubs = {
  "firebase-functions/v2/https": { onCall: (...a) => a[a.length - 1], HttpsError },
  "firebase-functions/v2/firestore": { onDocumentWritten: (...a) => a[a.length - 1] },
  "firebase-functions/v2": { setGlobalOptions() {} },
  "firebase-functions/params": { defineSecret: () => ({ value: () => "" }) },
  "firebase-admin": { initializeApp() {}, firestore, auth: () => ({ getUser: async () => ({ metadata: { creationTime: new Date(createdAt).toUTCString() } }) }) },
  "@anthropic-ai/sdk": Anthropic,
  "web-push": {},
};
const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, req)) return stubs[req];
  return realLoad.call(this, req, parent, isMain);
};
const F = require(path.join(REPO, "functions", "api", "profiles.js"));
const ACCESS = require(path.join(REPO, "functions", "access.js"));
const PROFILE = require(path.join(REPO, "functions", "profile.js"));
const quiet = async (p) => { const l = console.log, w = console.error; console.log = () => {}; console.error = () => {}; try { return await p; } finally { console.log = l; console.error = w; } };
const save = (uid, data) => quiet(F.updateProfile({ auth: { uid, token: {} }, data }));
const refused = async (p) => { try { await p; return null; } catch (e) { return e; } };
const avatar = Object.keys(PROFILE.AVATARS)[0];

(async () => {
  const was = ACCESS.PAYWALL.on;
  ACCESS.PAYWALL.on = true;

  console.log("");
  console.log("a free account (trial over, no subscription)");
  createdAt = Date.now() - 30 * 86400000; subscribed = false;
  store.set("profiles/free1", { bio: "Old bio" });
  aiCalls = 0;
  await save("free1", { avatar });
  check("changes its avatar", store.get("profiles/free1").avatar === avatar && aiCalls === 0);
  await save("free1", { avatar, bio: "Old bio" });
  check("saves with its bio as it is, for nothing", store.get("profiles/free1").bio === "Old bio" && aiCalls === 0);
  const e = await refused(save("free1", { avatar, bio: "A brand new bio" }));
  check("cannot set a new bio", e && e.code === "permission-denied" && e.details && e.details.code === "subscription-needed", e && e.message);
  check("and the refused bio never reached Claude", aiCalls === 0, aiCalls + " calls");
  check("nor was it saved", store.get("profiles/free1").bio === "Old bio");
  await save("free1", { avatar, bio: "" });
  check("clears its bio, for nothing", !("bio" in store.get("profiles/free1")) && aiCalls === 0);

  console.log("");
  console.log("a subscriber, and an account in its trial");
  subscribed = true; aiCalls = 0;
  await save("paid1", { bio: "Training for a marathon" });
  check("a subscriber sets a new bio, read by Claude once", store.get("profiles/paid1").bio === "Training for a marathon" && aiCalls === 1);
  subscribed = false; createdAt = Date.now() - 2 * 86400000; aiCalls = 0;
  await save("trial1", { bio: "Learning Japanese" });
  check("so does an account in its trial", store.get("profiles/trial1").bio === "Learning Japanese" && aiCalls === 1);

  console.log("");
  console.log("with the switch off (until payments), everyone");
  ACCESS.PAYWALL.on = false;
  createdAt = Date.now() - 30 * 86400000; aiCalls = 0;
  await save("free2", { bio: "Reading every day" });
  check("a free account sets a bio while the paywall is off", store.get("profiles/free2").bio === "Reading every day" && aiCalls === 1);
  ACCESS.PAYWALL.on = was;

  console.log("");
  console.log(fails ? fails + " FAILED" : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.log("FAIL  " + (err && err.stack || err)); process.exit(1); });
