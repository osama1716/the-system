# The System — Handoff (written end of session 3)

Read this first. It should be enough to pick up cleanly without re-reading
any old conversation. Sessions 1–2 built the local app; session 3 (this
one) added the entire backend/admin platform and planned what comes next.

---

## ⚠️ Read this before you try to run anything

**Your sandbox is NOT the user's machine.** They share a username
(`osama-pc\osama`) and look identical, but they are two different
filesystems. Session 3 lost ~30 minutes to this: `winget install nodejs`
and `npm install -g firebase-tools` succeeded *in the assistant sandbox*,
and the user then got "command not found" on their real machine, and we
both chased a phantom PATH bug.

What this means concretely:
- **The repo path differs.** Assistant sandbox:
  `C:\Users\osama\Downloads\files\the-system-app\`. User's real machine:
  `C:\Users\osama\Downloads\the-system\` (they cloned it fresh from GitHub
  in session 3).
- **GitHub is the shared channel.** You edit + commit + push; they
  `git pull`. That part works fine and is unaffected.
- **You cannot deploy.** Every `firebase deploy`, `firebase login`, and
  `npm install` that must affect the real project has to be run *by the
  user*, in their own terminal. Give them exact copy-paste commands.
- **You cannot verify signed-in behavior.** Your browser tool can load the
  live site and test rendering/logic, but it can't complete a real Google
  OAuth or hold a real session. Anything auth-gated is verified by the user
  reporting back.

---

## Where everything lives
- **Assistant-side repo**: `C:\Users\osama\Downloads\files\the-system-app\`
- **User-side repo**: `C:\Users\osama\Downloads\the-system\`
- **GitHub (public)**: `https://github.com/osama1716/the-system`
- **Live app**: `https://osama1716.github.io/the-system/` — installable PWA,
  auto-deploys from GitHub Pages on push (1–2 min lag).
- **Firebase project**: `the-system-44ff7` (Blaze plan, `nam5` Firestore,
  functions pinned `us-central1`).
- Git identity for commits: env vars on the commit command itself —
  `GIT_AUTHOR_NAME="The System" GIT_AUTHOR_EMAIL="dev@localhost"` (plus the
  `GIT_COMMITTER_*` pair). Never touch git config, global or local.

## What the app is
A Solo Leveling–style personal growth tracker. Zero-build, zero-dependency
front end — plain HTML/CSS/JS with classic `<script>` tags (no bundler, no
ES modules for the app's own code — it must keep working from a plain
`file://` double-click). As of session 3 it also has a real backend:
Firebase Auth + Firestore + Cloud Functions.

## Origin (why the data looks the way it does)
The user maintained a real Notion workspace before any of this existed:
- **SYSTEM Ranks** database (Rank/Level/Exp), **SYSTEM Tasks** database,
  8 **INTELLIGENCE** sub-databases (one per category, each row a named trait
  with an integer level), and a **STATISTICS** log of level transitions.
- The 8 categories and their real starting traits/levels (Self, Social,
  Linguistic, Logical-Mathematical, Bodily-Kinesthetic, Natural,
  Visual-Spatial, Musical, each with Arabic names) are seeded into
  `js/constants.js` exactly as they existed in Notion — **this is the
  user's actual real data, not placeholder content. Preserve it.**
- `EXP = Pt` (divisor 1) and `3 skill points per level` were deliberate
  choices (an earlier ÷20 divisor was a mistake, corrected to ÷1 — don't
  reintroduce a divisor unasked).
- The visual design (Bronze dark / White & gold, Outfit + IBM Plex Mono,
  one gold accent, ring-based level display) came from a separate design
  handoff doc. Only the *visual system* was adopted.
- Notion sync was raised once and **never pursued** — the app and Notion
  are two separate sources of truth. Only bring it up if the user does.

## Who the user is / how to work with them
- Gives specific, opinionated product feedback and expects it followed
  precisely. When an instruction is ambiguous they'd rather you make a
  concrete reasoned call and build it — but say what you decided and why.
- **Non-technical about infrastructure** (git, Firebase console, CLI) but
  very capable on product decisions. Infra instructions must be literal,
  numbered, "click this exact button". Abstract steps have caused confusion
  repeatedly. Screenshots they paste are the main unblocking channel —
  read them carefully before answering.
- **Speaks Arabic (Jordanian dialect) and English, mixed.** Session 3 ran
  largely in Arabic. Follow their lead; when they say "احكي عربي", switch.
- They catch real bugs from screenshots (spotted the overflowing error text
  and the missing admin-status check). Take their observations seriously —
  they've been right every time so far.
- They care deeply about the correctness of the EXP/undo ledger. Treat bugs
  there as high priority.

---

## Feature set (current)

### Local / offline (unchanged from sessions 1–2)
- **Ranks/levels/EXP**: G→S ranks, 100 levels each, 100 EXP/level. `Pt` on a
  task **is** its EXP (`expDivisor` setting, default 1).
- **Fully symmetric EXP ledger** via `state.levelHistory` — raising
  completion% grants EXP/levels/skill points; lowering it takes back the
  *exact* same amount, including un-investing the exact trait a level-up
  gave a point to, and reversing rank-ups. **Don't regress this.**
- **8 Intelligence categories** with editable traits + user-added custom
  categories. Skill points on level-up are distributed proportional to the
  category the EXP was tagged with, into that category's currently-weakest
  trait, with fractional remainders banked.
- **Quests** (one-off) and **Habits** (recurring, 1–7×/week, unit + amount,
  live timer for time-based units) on separate pages.
- **Stats page**: week bar chart + month day-by-day list, backed by
  `state.dailyStats` (also symmetric).
- **Two themes**, PWA (manifest + service worker, network-first).
- **No sound effects, no music** — both were built then explicitly removed.
  **Do not re-add without being asked.**

### Cloud (session 2 + 3)
- Firebase Auth: **email/password + Google sign-in**, email verification on
  signup, password reset.
- Firestore sync: debounced push after every change; pull-on-focus.
- Optional App Check (`js/appcheck-config.js`, still `"PASTE_ME"` —
  registered but not yet configured/enforced).

### Admin platform (all of this is session 3)
- **Admin account** via a Firebase Auth custom claim — unforgeable, checked
  server-side. `osamaghanem129@gmail.com` is the bootstrapped admin.
- **Admin page** (nav item only visible to admins): look up any user by
  email, view their stats, promote/demote other admins (two-click confirm),
  "Sync directory" backfill.
- **Mission submission & approval**: users propose missions from the Quests
  page; admin sees a queue, assigns a point value, approves or rejects.
- **Messaging + bonuses/penalties**: admin composes a message with an
  optional +/- EXP amount for the looked-up user; user sees it in an inbox
  section on the Log page with an unread badge.
- All admin-driven user-facing copy says **"the system"**, never "the
  admin" — deliberate, the user asked for this explicitly.

---

## Backend architecture (and the reasoning behind it)

### The one big design decision: `pendingGrants`
Cloud Functions **never write `player.exp`/`level` into `users/{uid}`
directly.** The client's own debounced `push()` overwrites that entire
document periodically, so a server-side write into part of it gets silently
clobbered seconds later — and porting the EXP math server-side would mean
maintaining the same ledger logic in two places that can drift.

Instead: an admin action writes a small record to
`users/{uid}/pendingGrants/{id}` (`{amount, reason, sourceType, ...}`,
client can read + delete but never create). On the client's next
pull/focus, `applyPendingGrants()` in `js/main.js` runs each one through
the real, **unmodified** `SYS.applyExpDelta` from `js/engine.js` — exactly
as if it were a normal quest completion — then deletes the grant doc.

Consequences worth knowing: zero duplicated math, correct `levelHistory`
and undo semantics for free, and it structurally cannot race `push()`.
Negative amounts (penalties) work with no extra code because
`applyExpDelta` is already symmetric. **Keep using this pattern for any
future server-authorized EXP.**

### Collections & rules (`firestore.rules`)
- `users/{uid}` — owner read/write with schema validation; **admin can also
  read** (this gives the admin's browser unaudited read access to a user's
  entire private state; the user was told and accepted this).
- `users/{uid}/pendingGrants/{id}` — owner read+delete, create/update false.
- `users/{uid}/inbox/{msgId}` — owner read; owner may update **only** the
  `read` field; create/delete false.
- `userDirectory/{uid}` — `{email, createdAt}`, admin-read-only, written by
  an Auth `onCreate` trigger. Populated for pre-existing accounts by the
  `backfillUserDirectory` callable.
- `missionSubmissions/{id}` — top-level (not a subcollection) because the
  admin's main view is "all pending across everyone". Create restricted to
  own uid + forced `status:'pending'` + no pre-seeded points; **update is
  flatly `false` for every client including the admin** — all transitions
  go through Cloud Functions.

**Firestore rules gotcha that will bite you:** rules can't filter a list
query, only allow/reject it whole. A regular user's "my submissions" query
**must** include `.where('userId','==', myUid)` or it's rejected outright.
Only the admin's unfiltered "all pending" query may omit it.

### Cloud Functions (`functions/index.js`, 2nd gen, `us-central1`)
`onUserCreate` (v1 auth trigger), `setAdmin`, `getAdminStatus`,
`backfillUserDirectory`, `approveMission`, `rejectMission`,
`applyAdjustment`. All admin-gated on `request.auth.token.admin === true`.
Mission approve/reject use transactions to prevent double-approval.

### Bootstrap (already done, don't redo)
No "make me admin" endpoint is ever deployed. `scripts/bootstrap-admin.js`
is a one-off local script run with a downloaded service-account key; the
key was deleted afterward. Custom claims only appear in a *fresh* ID token,
so any promoted account must sign out and back in.

---

## Deployment workflow (the recurring loop)

You: edit code → commit → push. Then hand the user commands to run in their
terminal at `C:\Users\osama\Downloads\the-system`:

```
git pull
firebase deploy --only functions:NAME,firestore:rules,firestore:indexes
```

- **Front-end-only changes need no deploy** — GitHub Pages picks them up in
  1–2 minutes. Say so explicitly, it saves the user a pointless step.
- Deploy only what changed (`--only functions:approveMission`) — full
  deploys are slow and noisy.
- **First deploy of a brand-new function often fails** with "failed to
  create function" because the required Google APIs were only just enabled.
  Wait ~2 min and re-run for that one function; it succeeds. This happened
  and is expected, not a real error.
- Node 20 deprecation warnings on deploy are noise for now.

---

## Session 3 changelog (newest last)
1. Security review + fixes: color sanitization against stored XSS via
   imported backups, versioned `firestore.rules` with schema validation,
   optional App Check wiring, email verification + password reset.
2. Google sign-in — **switched from `signInWithRedirect` to
   `signInWithPopup`.** Redirect silently never completed: the OAuth
   request was correct, but Chrome's third-party storage restrictions break
   the cross-domain relay Firebase uses to hand the result back. Popup uses
   `postMessage` and works. **Don't "fix" this back to redirect.**
3. Fixed the sync-choice modal appearing on every app open (it checked
   "does cloud data exist" instead of "does it differ" — Firebase keeps you
   signed in, so the handler fires every boot). Added `SYS.deepEqual`.
4. Phase 1 — admin foundation (claims, functions, admin page, pendingGrants).
5. Phase 2 — mission submission & approval.
6. Phase 3 — messaging + bonuses/penalties.
7. Copy change: admin actions attributed to "the system".
8. CSS: `.toast-error` now wraps (long URLs were overflowing the panel).

---

## PLANNED NEXT — the AI evaluation system (this is the priority)

This is what the next session should build, and it's the user's own idea
(refined across a long discussion in session 3). **Read this whole section
before designing anything.**

### The problem it solves
Right now a user sets their own Pt value on any quest/habit they create and
clicks "done" themselves. Nothing verifies it. That's fine for private
self-tracking, but it makes any global leaderboard trivially cheatable —
create a quest worth 999999999 points, click done, be #1.

### The design (agreed with the user)
**An AI evaluates a quest or habit at creation time and assigns its EXP
value — the user never sets their own points.**

- **Quests**: when a user creates one, the AI reads the title/description
  and decides its EXP value.
- **Habits**: evaluated **once, as a template.** The user's key insight —
  a habit is created and priced a single time, then all its day-to-day
  repeat logging stays local, instant, and free (no AI call per repeat).
  This is what keeps cost and latency sane.
- Completion/logging itself stays **local, instant, and unchanged.** The AI
  is only in the creation path, never the daily-use path.
- **Also planned**: the AI should assign the intelligence *trait* points
  precisely rather than defaulting to the weakest trait. E.g. a task that's
  50% linguistic / 50% logical-mathematical should put a point in the
  specific fitting trait in each category. Today `allocatePoints()` in
  `js/engine.js` always picks the weakest trait in the category — the AI
  would supply an explicit target trait instead. (The `pendingGrants`
  record would carry the chosen trait; `applyExpDelta`/`allocatePoints`
  need a way to honor an explicit trait target.)

### Why this matters beyond cheating
If *every* EXP source is AI-priced, the personal level becomes trustworthy
on its own — which likely means **the separate "Ranked EXP" idea becomes
unnecessary** and the leaderboard can just use the real level. See the open
question below.

### Implementation notes for whoever builds it
- Use the **Claude API** (`claude-api` skill has current model IDs, pricing,
  and SDK patterns — read it before writing any API code).
- It must run **server-side in a Cloud Function**, never client-side — an
  API key in `js/` on a public GitHub Pages repo would be immediately
  harvested. Store the key with Firebase secrets
  (`firebase functions:secrets:set`), never in the repo.
- Cost: roughly a fraction of a cent per evaluation with a small model.
  The user asked about this directly and accepts it's not free but is
  cheap. Be honest about ongoing cost if the design changes.
- The existing `approveMission` shape (`{missionId, points}` → writes a
  `pendingGrants` record) is deliberately AI-ready: an AI evaluator just
  supplies `points` automatically instead of the admin typing it. **Little
  to no rework of session 3's plumbing should be needed.**
- The user explicitly asked whether to train their own model. Answer given
  (and they accepted): building a foundation model costs hundreds of
  millions of dollars and a research org; the real-world approach is to use
  a strong existing model and customize *behavior* via prompting. Don't
  reopen this unless they do.

---

## Open decisions (do NOT just start building these)

1. **Leaderboard fairness — the one genuinely unresolved question.**
   Phase 4 (global leaderboard) is designed but deliberately not built,
   because it depends on this. The options discussed:
   - *"Ranked EXP"* — a second, separate, server-only counter that only
     admin/AI-approved work increases; leaderboard ranks by that, personal
     level stays private and free. Safe today.
   - *Just use the personal level* — becomes viable **if** the AI system
     above prices everything, since then nothing is self-assigned.
   The user was genuinely torn ("كثير محتار") and we agreed to defer. The
   assistant's recommendation at the end of session 3: **build the AI
   evaluation system first**, then build the leaderboard once, in its final
   simple form, instead of building and rebuilding it. The user seemed to
   agree but this wasn't formally confirmed — confirm before building.
   - Related sub-decision if two numbers do coexist: don't show a personal
     "S-Rank" next to a global rank on the same screen (that's the
     "تناقض" the user was worried about). Either separate the vocabulary
     entirely, or compute a *second* G→S rank from the verified number.

2. **Phase 4 leaderboard, once #1 is settled.** Design already worked out:
   `leaderboard/{uid}` public-readable mirror `{displayName, level, exp,
   questsCompleted, updatedAt}` written **only** by a Firestore `onWrite`
   trigger on `users/{uid}`. Deliberately **no stored rank** — rank is a
   property of the collection, not a document; compute it client-side from
   `orderBy('exp','desc')` position. Verified safe to expose:
   `state.player.name` is a free-text user-editable field, never
   email-derived.

3. **Real-money rewards** — the user wants this eventually. Explicitly
   deferred pending *their own legal advice*. Prize/sweepstakes law varies
   by country and both app stores have specific rules that can get an app
   rejected. Don't build payout logic. If it comes up, the honest answer is
   still: get legal advice first; also note the leaderboard should be
   genuinely tamper-proof before money is attached (see the known
   limitation below).

4. **Google Play / App Store** — researched in session 3: Google Play is
   **$25 one-time**, Apple **$99/year**. As a PWA it'd be wrapped as a TWA
   via Bubblewrap/PWABuilder (free). Play also requires a privacy policy
   URL, a Data Safety form, and (for new personal accounts) a closed test
   with ≥12 testers for 14 days. Nothing started.

5. **Repo stays public** (to avoid GitHub Pro for private Pages), which is
   why no copyrighted music can ever be added.

---

## Known limitation (accepted, documented, not a bug)

`users/{uid}`'s `player.exp`/`level` are still written by the client's
normal sync. A technically savvy user could inflate their own stats via
devtools. What *is* guaranteed is that admin/AI-authorized grants
(missions, adjustments) are server-verified and can't be fabricated.

Fully closing this means moving all EXP-granting server-side and making the
client's EXP fields read-only — a much bigger rewrite. **It should be
revisited before real money is ever attached to rankings.** The AI
evaluation system narrows the gap (nothing is self-*priced* anymore) but
does not by itself close it (the stored number is still client-written).

---

## Working conventions
- Test in the browser tool before pushing: serve on a fresh port, clear
  `localStorage`, exercise the feature, check the console.
- **The console error "An unknown error occurred when fetching the script"
  is the sandbox's known inability to register service workers.** It
  appears on literally every run. It is not a real bug — don't chase it.
- Render functions in `js/ui.js` are pure `(state, ui) → HTML string`; all
  event wiring lives in `js/main.js` via delegated `data-action` handlers.
  Follow that split.
- Everything user-supplied goes through `escapeHtml()`. Keep it that way.
- Destructive UI actions use the existing arm/disarm "click again to
  confirm" pattern (`ARMABLE` in `js/main.js`) — reuse it, don't invent a
  new confirm mechanism.
- After pushing, verify with `git log --oneline -1 origin/main` rather than
  trusting the push output.
- Commit messages: explain *why*, not just what. Match the existing style.
