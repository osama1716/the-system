# The System — recurring "which copy do you want to keep?" prompt

Written 2026-09-10 for a second opinion. All code is public:
https://github.com/osama1716/the-system

## The app in one paragraph

Solo-Levelling-style personal growth tracker. Zero-build front end: plain
HTML/CSS/JS, classic `<script>` tags, no bundler, no ES modules (it must keep
working from a `file://` double-click). Firebase Auth + Firestore + 18 Cloud
Functions. Deployed to GitHub Pages. Relevant files: `js/main.js` (state,
sync, event wiring), `js/cloud.js` (all Firestore access), `js/engine.js`
(game rules), `functions/index.js`, `firestore.rules`.

## The symptom

On every page load, a modal appears: "EXISTING ACCOUNT DATA FOUND — Your
account already has progress saved from another device. Which copy do you want
to keep?" Answering it does not stop it returning on the next load. This has
persisted for weeks on one account (the project owner's, which is also the
admin account).

## How sync works

- `users/{uid}` holds `{ state, updatedAt }`. The whole document is replaced by
  a debounced client push, so Cloud Functions never write into it directly.
- On sign-in: `pull()` reads the stored copy, `normalizeState()` is run over
  both it and the local copy, and they are compared with a deep equal. Equal →
  nothing (or a push if this load migrated something). Unequal → the prompt.
- `users/{uid}/expEvents/{id}` is an append-only journal of every EXP movement.
  `expTotals/{uid}` holds `{ baseline, journalExp }`; their sum is the
  authoritative standing. `reconcileExpWithServer()` (main.js) corrects the
  local standing towards it four seconds after sign-in.

## Root causes found and fixed (all verified, all shipped)

1. **The client and server measured a standing in different units.**
   Levels were re-priced per rank (`RANK_LEVEL_EXP = [15,30,50,75,100,130,170,200]`)
   in `js/engine.js`; `totalExpOf` in `functions/index.js` was left on the old
   flat `(rankIdx*100 + level-1)*100 + exp`, despite a comment on both saying
   they must change together. They disagreed on 39 of 40 standings checked.
   `reconcileExpWithServer` subtracts one from the other, so the difference was
   never zero and it "corrected" the player on **every load**, rewriting the
   state and guaranteeing a mismatch with the stored copy.
   Fixed in commit `4e8d595`. Verified: 3200/3200 standings now agree.

2. **`expTotals.baseline` values were grandfathered with the old formula** and
   were therefore inflated. Fixed by an exact conversion (the old encoding is
   invertible) behind an idempotence stamp — commit `bd00c8c`, admin callable
   `backfillExpBaselines`. Verified: 3200/3200 encode→decode round-trips.

3. **`sanitizePlayer` clamped `exp` to 0..99**, but a B/A/S-rank level costs
   130/170/200 — it was deleting up to 100 exp from the highest ranks.
   Fixed in `4e8d595`.

4. **`normalizeState` wrote a log line when it migrated something**, inside the
   very copy it was about to compare. The line lands only on the copy that
   needed migrating, so a migrated copy and an unmigrated one could never
   compare equal. Fixed in `a6b9be5`.

5. **A deadlock with no exit.** Once the device matched the journal exactly,
   `reconcileExpWithServer` found nothing to correct and returned before
   saving — and the conflict branch deliberately never pushes. So the one
   condition that raises the prompt also removes every path that could write
   the stored copy. `resolveOrAsk` (commit `860b0a8`) now treats
   "device matches the journal, stored copy does not" as staleness and pushes
   instead of asking. Verified across all four cases.

## What is still unexplained

After all of the above, the live diagnosis on the affected account reads:

```
this device            1210 (G Lv81)
account doc             200 (G Lv14)
journal (expTotals)    1210 (G Lv81)
pending grants            0
unsent exp events         0
account doc written    406h ago          <- 17 days
saves asked / written     1 / 1
saves ok / failed         0 / 0
saves dropped             0 superseded, 0 no user
```

**`users/{uid}` has not been written for 17 days, and a write that was started
neither resolved nor rejected.** `pushStats` is incremented in `js/cloud.js`:
`started` just before `.set()`, `ok` in `.then`, `failed` in `.catch`. So the
`.set()` promise is simply pending.

Notes that may matter:

- Reads work throughout — `pull()`, `fetchExpSummary()` and admin callables all
  return fine in the same session. Only the write hangs.
- Firestore offline persistence is **not** enabled (no `enablePersistence`
  call), so reads are server reads.
- `firestore.rules` `isValidSave` restricts `state` to exactly ten keys via
  `hasOnly`, caps `tasks`/`log`/`levelHistory`/`intTypes` sizes, and requires
  `updatedAt == request.time`. A rules rejection produces a normal
  `permission-denied` error, which would have been counted as `failed`.
- The rules were redeployed during investigation; the functions were redeployed
  after every server change.
- The account has never had more than one real device in use.

**The open question: what makes a Firestore `set()` on this one document hang
indefinitely — no resolve, no reject — while reads on the same document in the
same session succeed?**

## One regression worth knowing about

An attempt to fix this by replacing the fire-and-forget `push()` with an
awaited, read-back `pushNow()` (commit `ec9a68c`) brought the modal back and was
reverted (`78f17f2`). Cause: `resolveOrAsk` ends in `.catch(() => ask())`, and
`SYS.Cloud.pushNow` throws outright if `js/cloud.js` is an older build — which
the service worker will serve, because it falls back to the cached copy for any
file the network answers with a non-ok status, and GitHub Pages does exactly
that for a few seconds mid-rollout. A new `main.js` against a cached `cloud.js`
was enough.

## Reproducing

The account state is specific and accumulated. A clean account has not been
observed to reproduce it. The relevant code paths are `resolveOrAsk`,
`reconcileExpWithServer` and `push` — all in `js/main.js` and `js/cloud.js`.
