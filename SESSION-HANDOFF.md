# The System — Handoff (written end of session 5)

Read this first. It should be enough to pick up cleanly without re-reading
any old conversation. Sessions 1–2 built the local app, session 3 added the
backend and admin platform, session 4 added AI task evaluation, appeals,
seven languages, and unique display names. Session 5 (this one) built the
global leaderboard — the last item from the original plan.

---

## ⚠️ Read this before you try to run anything

**Your sandbox is NOT the user's machine.** They share a username
(`osama-pc\osama`) and look identical, but they are two different
filesystems. Session 3 lost ~30 minutes to this: `winget install nodejs`
and `npm install -g firebase-tools` succeeded *in the assistant sandbox*,
and the user then got "command not found" on their real machine.

- **The repo path differs.** Assistant sandbox:
  `C:\Users\osama\Downloads\files\the-system-app\`. User's real machine:
  `C:\Users\osama\Downloads\the-system\`.
- **GitHub is the shared channel.** You edit + commit + push; they
  `git pull`. That part works fine.
- **You cannot deploy.** Every `firebase deploy` has to be run *by the
  user*, in their own terminal. Give them exact copy-paste commands.
- **You cannot verify signed-in behavior.** Your browser tool can load the
  live site and test rendering/logic, but it can't complete a real Google
  OAuth or hold a real session. Anything auth-gated is verified by the user
  reporting back.
- **Node IS available in your sandbox** (`/c/Program Files/nodejs`) — useful
  for `new Function(src)` syntax checks and for running logic unit-tests
  outside the browser. Add it to PATH in each Bash call.

---

## Where everything lives
- **Assistant-side repo**: `C:\Users\osama\Downloads\files\the-system-app\`
- **User-side repo**: `C:\Users\osama\Downloads\the-system\`
- **GitHub (public)**: `https://github.com/osama1716/the-system`
- **Live app**: `https://osama1716.github.io/the-system/` — PWA,
  auto-deploys from GitHub Pages on push (1–2 min lag).
- **Firebase project**: `the-system-44ff7` (Blaze, `nam5` Firestore,
  functions pinned `us-central1`).
- Git identity: env vars on the commit command itself —
  `GIT_AUTHOR_NAME="The System" GIT_AUTHOR_EMAIL="dev@localhost"` (plus the
  `GIT_COMMITTER_*` pair). Never touch git config.
- The user has **two accounts**: `osamaghanem129@gmail.com` (the admin) and
  `osamaghanem1716@gmail.com` (a test account). Both are real and in use for
  testing two-sided flows.

## What the app is
A Solo Leveling–style personal growth tracker. Zero-build front end — plain
HTML/CSS/JS with classic `<script>` tags (no bundler, no ES modules; it must
keep working from a plain `file://` double-click). Backed by Firebase Auth +
Firestore + 15 Cloud Functions, and the Claude API for task pricing.

## Origin (why the data looks the way it does)
- The 8 intelligence categories and their starting traits/levels in
  `js/constants.js` are the user's **real data** from a Notion workspace
  they kept before this existed. Preserve it.
- `EXP = Pt` (divisor 1) and `3 skill points per level` are deliberate.
- The Bronze dark / White & gold palette came from a design handoff doc.
- Notion sync was raised once and **never pursued**. Only bring it up if
  they do.

## Who the user is / how to work with them
- Gives specific, opinionated product feedback and expects it followed
  precisely. When ambiguous they'd rather you make a reasoned call and say
  what you decided.
- **Non-technical about infrastructure** but very capable on product
  decisions. Infra instructions must be literal and numbered. Screenshots
  they paste are the main unblocking channel — read them carefully.
- **Speaks Arabic (Jordanian) and English, mixed.** Sessions 3–4 ran largely
  in Arabic. Follow their lead.
- **They catch real bugs.** In session 4 alone their questions surfaced: the
  crowded language switcher, the ambiguous "Uphold" label, the stale-cache
  problem, the username migration gap, and — indirectly, by asking "doesn't
  it work in all languages?" — a validation bug that would have locked out
  Chinese and Indic names. Take their observations seriously and actually
  go look.
- They care deeply about the EXP/undo ledger being exact. Treat bugs there
  as high priority.

---

## Feature set (current)

### Local / offline
- Ranks G→S, 100 levels each, 100 EXP/level.
- **Fully symmetric EXP ledger** via `state.levelHistory` — undo takes back
  exactly what was granted, including un-investing the specific trait.
  **Don't regress this.** Every change to EXP paths gets round-trip tested.
- 8 intelligence categories + user-added ones; **skill points now go to the
  trait the work actually built** (see traitComposition below), falling back
  to weakest-trait when there's no AI-assigned target.
- Quests (one-off) and Habits (recurring, live timer for time units).
- Stats week/month views, backed by a symmetric per-day ledger.
- PWA with offline cache; prompts to reload when a new version ships.
- Notifications can be **sticky** (wait to be dismissed) and can **carry an
  action button** — added for the update prompt, reusable.
- **No sound effects, no music** — removed by request. Don't re-add.

### Cloud
- Auth: email/password + Google (**popup, not redirect** — see gotchas).
- Firestore sync: debounced push, pull-on-focus.
- App Check wired but **still `"PASTE_ME"`** — never configured.

### Global leaderboard (session 5)
- A **Ranking** page between Stats and Intelligence. Reads
  `leaderboard/{uid}`, a public projection written **only** by the
  `mirrorLeaderboard` onWrite trigger on `users/{uid}`.
- **Ranks on personal EXP**, confirmed with the user. No separate "ranked
  EXP" counter — nothing is self-priced any more, so the personal level is
  defensible and a second number would be one more thing to explain.
- `SYS.totalExp(player)` flattens rank/level/exp into one sortable number
  (`(rankIdx*100 + level-1)*100 + exp`). `totalExpOf` in
  `functions/index.js` computes the same thing — **change them together.**
  They were checked against each other across all 160 rank/level/exp
  combinations, and against the real level loop up to the S-rank cap (79,999).
- **No stored rank.** Position is a property of the collection, so it is
  derived from query order. Equal totals share a position (1, 2, 2, 4).
- **Names have a 30-day cooldown** (session 5). A released name is parked, not
  deleted: the record stays, still pointing at its previous owner, carrying a
  `heldUntil` expiry. Nobody else can take it until that passes, and the
  previous owner can always reclaim it — which also makes an accidental rename
  undoable instead of final. No cleanup job: an expired record is simply
  overwritten by the next claim. Duration is one constant,
  `USERNAME_COOLDOWN_DAYS`. `claimBlocker()` is the single rule, shared by
  claimUsername / checkUsername / backfillUsernames so the availability preview
  can never disagree with the claim.
- **Only accounts with a reserved name appear.** A ranking has to identify
  people unambiguously; an unreserved name may already be shared. The page
  says so instead of leaving someone silently absent. Claiming a name pushes
  the row immediately rather than waiting for the next state sync.
- The trigger **compares the four mirrored fields before writing**, so
  editing a note or switching theme doesn't cause a public write.
- Top 100 is fetched. Someone below that gets their own row pinned beneath,
  with a bounded scan for the exact position (caps at "500+").

### Admin platform
- Admin via unforgeable Firebase Auth custom claim.
- Admin page: look up any user **by display name or email**, view stats,
  promote/demote (two-click confirm), directory/username/leaderboard
  backfills.
- Messaging + EXP bonuses/penalties.
- **Appeals** (replaced mission submissions — see below).

### AI task evaluation (session 4, the big one)
- Users **cannot set their own EXP values.** Creating a quest or habit calls
  `evaluateTask`, which prices it via the Claude API and assigns its
  intelligence categories and specific traits.
- **A habit is priced once, at creation, as a template** — the per-repeat
  logging that follows is local, instant and free. This was the user's own
  idea and it's what keeps cost bounded: one API call per task created, not
  per action taken.
- Adding a task therefore **requires an account and a connection** (the
  user chose this over a manual fallback). Everything else still works
  offline.
- Tuning lives in `functions/ai-config.js`: model, per-user daily cap (40),
  input length caps, and the calibration scale. **Changing the model is a
  one-line edit there.** Currently `claude-sonnet-5`.

### Internationalisation (session 4)
- **7 languages**: English, العربية, Español, Français, Deutsch, 日本語, 中文.
  268 keys in `js/i18n.js`, all complete for all 7.
- **Full RTL for Arabic** — `<html dir>` flips and CSS uses logical
  properties. Chevrons mirror; the brand mark doesn't. Mono runs (`40/100`,
  `+500 xp`) are pinned LTR so bidi doesn't scramble them.
- Missing translations fall back to English, so a partial language is
  usable. **Adding a language = a code in `SYS.LANGUAGES` + one value per
  key.**
- Units are translated for **display only** — the stored value stays the
  English key so switching language never rewrites saved task data.

### Themes (session 4)
- `SYS.THEMES` in `js/constants.js` is now the **single source of truth**;
  `SYS.applyTheme` writes every value as a CSS custom property. Adding a
  theme is one object — nothing to add in `styles.css`.
- **Custom theme**: user picks dark/light + accent + background; the other
  ~35 values are derived. Light-vs-dark text is derived from the
  background's actual luminance, not the requested mode, so no combination
  produces unreadable output.

### Unique display names (session 4)
- Names must be unique because a global ranking is meaningless otherwise.
- Enforced **server-side**: the normalised name is the document ID in
  `usernames`, so the database rejects a second writer. Claiming is one
  transaction that releases the old name and takes the new one together.
- Validation accepts **any script** (`\p{L}\p{N}\p{M}`), min 2 chars (not 3
  — Chinese/Japanese two-character names are complete), max 20.
- **Signed out, the name stays local and free-form** — nothing to compete
  with, nothing to reserve.
- `backfillUsernames` (admin) claims names for pre-existing accounts;
  duplicates are reported as conflicts rather than auto-renamed, since the
  name is about to be public.

---

### Weekly directives (session 5)
- `suggestQuests` proposes 3-5 tasks once a week, chosen from the categories and
  traits the person has left alone. Suggestions, never assignments: nothing is
  added until accepted.
- **Each arrives already priced**, and the price is recorded in `aiPrices` like
  any other. Accepting therefore costs **no** extra AI call, a declined one
  costs nothing at all, and the resulting journal entries verify normally.
  One call per user per week, cached in `suggestions/{uid}` by ISO week.
- The server`s week key is the same ISO-8601 one `js/engine.js` uses for habit
  weeks — checked against it across 730 days, so the two never disagree.
- `state.suggestions` = `{ weekKey, handled: [ids] }` tracks what was answered.
  It is a **new top-level state key**, so it had to be added to `isValidSave`
  in `firestore.rules` — that list is a `hasOnly`, and a key missing from it
  makes every save fail.

## Backend architecture

### The one big design decision: `pendingGrants`
Cloud Functions **never write `player.exp`/`level` directly.** The client's
debounced `push()` overwrites the whole `users/{uid}` document periodically,
so a server-side write into part of it gets clobbered seconds later.

Instead: an admin/AI action writes to `users/{uid}/pendingGrants/{id}`. On
the client's next pull, `applyPendingGrants()` runs each through the real,
**unmodified** `SYS.applyExpDelta` — so level-ups, trait investment and undo
history all come out correct for free. **Keep using this pattern.**

Two grant shapes: a flat `amount` (bonus/penalty), or a `repriceTask`
(from a resolved appeal) which recomputes its own delta client-side via
`SYS.repriceTask`.

### Collections & rules (`firestore.rules`)
- `users/{uid}` — owner read/write with schema validation; **admin can also
  read** (unaudited, accepted).
- `users/{uid}/pendingGrants/{id}` — owner read+delete, no client create.
- `users/{uid}/inbox/{msgId}` — owner read; owner may update **only** `read`.
- `userDirectory/{uid}` — `{email, name, usernameKey}`, admin-read-only.
- `usernames/{normalisedName}` — signed-in read (availability preview),
  **no client write at all**.
- `appeals/{id}` — create own with forced `status:'pending'`; read own or
  admin; **update flatly false** (all transitions go through functions).
- `aiUsage/{uid}` — server-only both ways.
- `leaderboard/{uid}` — `{displayName, rank, level, exp, totalExp,
  questsCompleted, updatedAt}`. Signed-in read, **no client write at all**.
  Indexed automatically (single field `totalExp`), so no
  `firestore.indexes.json` entry was needed.

**Firestore gotcha:** rules can't filter a list query, only allow/reject it
whole. A user's own "my X" query **must** include `.where('userId','==',
myUid)` or it's rejected outright.

### Cloud Functions (`functions/index.js`, 13, 2nd gen except onUserCreate)
`onUserCreate`, `claimUsername`, `checkUsername`, `backfillUsernames`,
`lookupUser`, `resolveUsers`, `setAdmin`, `getAdminStatus`,
`backfillUserDirectory`, `resolveAppeal`, `rejectAppeal`, `applyAdjustment`,
`evaluateTask`, `mirrorLeaderboard`, `backfillLeaderboard` (15 now —
`mirrorLeaderboard` is the only Firestore trigger; everything else is
callable). All admin ones gate on `request.auth.token.admin === true`.

### Secrets
`ANTHROPIC_API_KEY` is a Firebase secret
(`firebase functions:secrets:set`). Never in the repo — this is a public
GitHub Pages project.

---

## Deployment workflow

You: edit → commit → push. Then hand the user commands to run at
`C:\Users\osama\Downloads\the-system`:

```
git pull
firebase deploy --only functions,firestore:rules
```

- **Front-end-only changes need no deploy** — say so explicitly, it saves
  them a pointless step. Most UI/i18n/theme work is in this category.
- **First deploy of a brand-new function often fails** with "failed to
  create function" because the required Google APIs were only just enabled.
  Wait ~2 min and re-run for that one function.
- Node 20 deprecation warnings are noise for now.

---

## Session 5 changelog
1. **The global leaderboard.** Trigger + rules + page + all 7 languages.
   Needs `firebase deploy --only functions,firestore:rules`.
3. **Fixed the splash-screen hang** (the recurring one). The service worker
   was serving GitHub Pages mid-deploy error pages as scripts, and caching
   them. Front-end only — no deploy needed for this part.
4. **30-day username cooldown.** Needs
   `firebase deploy --only functions`.
5. **The EXP journal.** Public standings are computed from an append-only
   record instead of the client's own EXP number. Needs
   `firebase deploy --only functions,firestore:rules`.
6. **"A new version is ready" prompt**, the user's request, arising directly
   from 3: the worker skipWaiting()s, so a new version takes charge while the
   tab keeps running the old JavaScript, and nothing used to say so. Sticky
   notification with Reload and a dismiss. It asks rather than reloading —
   a reload would discard a half-written quest or a running habit timer.
   **Confirmed working by the user on the following deploy** (service workers
   don't register in the sandbox, so this could not be tested here).
2. `backfillLeaderboard` (admin). The trigger only fires on a write that
   changes a mirrored field, so existing accounts would have stayed off the
   board until they next gained EXP — which would read as a broken feature on
   launch day.

   **Two admin buttons, in this order: "Reserve existing names", then "Sync
   leaderboard".** The board only lists accounts holding a reserved name, and
   any account predating session 4 holds none — so running the second alone
   writes zero rows and produces an empty board with no visible reason. This
   was hit for real on launch; the toast now names the prerequisite instead of
   only counting what it skipped.

   Verified end to end by the user afterwards: both accounts listed, own row
   highlighted, "You" tag present.

## Session 4 changelog (newest last)
1. AI task evaluation (`evaluateTask`, `ai-config.js`, secret, quota).
2. Fairness fixes from user review: dropped the self-declared time-horizon
   label (gameable), made description length explicitly non-pricing, made a
   description required, tightened habit values.
3. Skill points invest in the AI-named trait (`player.traitComposition`,
   snapshotted in `levelHistory` so undo stays exact).
4. **Mission submissions → value appeals.** Missions became redundant once
   everything was auto-priced; what an automatic system actually needs is a
   human review path. `SYS.repriceTask` computes the exact delta.
5. Theme engine driven from JS; custom palette with luminance-derived
   readability.
6. Fixed the sync-choice prompt firing every launch (`normalizeState` now
   runs on **both** the local and the pulled copy before comparing).
7. English/Arabic + full RTL; then Spanish, French, German, Japanese,
   Chinese.
8. Theme + language became dropdowns (7 pills collided).
9. Service worker actually fetches fresh files now (`cache: "no-cache"`;
   it was silently served from the browser HTTP cache).
10. Unique display names; appeals show name + email instead of a raw uid;
    admin search by name or email; username backfill for old accounts.

---

## PLANNED NEXT

**The original plan is now complete.** Everything below is new ground.

### 1. Theme designs from Claude Design
The user said they'd send palettes. The engine is ready: adding one is a
single object in `SYS.THEMES` and it appears in the dropdown automatically.

### 2. Leaderboard follow-ons, if the user wants them
None of these were asked for — don't build unprompted:
- Filters (friends, this week, per intelligence category).
- Refusing unverified journal entries outright, once tasks predating recorded
  prices have aged out (see the EXP journal section).
- Pagination past the top 100.
- Making the EXP fields server-authoritative (see Known Limitation — this
  one genuinely matters more now that the numbers are public).

---

## Open decisions (do NOT just start building these)

1. **Real-money rewards** — deferred pending *their own legal advice*.
   Prize/sweepstakes law varies by country and both app stores have rules
   that can get an app rejected. Don't build payout logic.
2. **Google Play / App Store** — researched: Play is **$25 one-time**,
   Apple **$99/year**. As a PWA it'd be wrapped as a TWA via
   Bubblewrap/PWABuilder (free). Play also needs a privacy policy URL, a
   Data Safety form, and a closed test with ≥12 testers for 14 days.
3. **Subscription model** — the user asked. Answer given: technically fine,
   needs a payment processor (~3% fees); app stores force their own IAP at
   **15–30%**; legal/tax side needs local advice for Jordan. A subscription
   would also cover the AI API cost.
4. **Repo stays public** (avoids GitHub Pro), so no copyrighted music ever.

---

## The EXP journal (session 5) — read before touching EXP

`users/{uid}/expEvents/{id}` is an append-only record of every EXP movement;
rules allow create and **nothing else**. `expTotals/{uid}` (server-only) holds
`{baseline, journalExp}`, and `leaderboard/{uid}.totalExp` is their sum.

- **The hook is in `applyExpDelta`, at the very end, and is an observer.** Its
  return value is ignored and a throw inside it is caught, so the ledger cannot
  be affected by it. Don't move it above the `state.player = {...}` assignment.
- **It records what the ledger actually moved, never the requested delta.** The
  two differ at both ends: a penalty larger than someone's remaining EXP stops
  at zero, and gains past S Lv100 are discarded. A 200-run property test caught
  this — recording the request drifts the public number permanently.
- **`SYS.expToStanding`** is the inverse of `SYS.totalExp`; the board derives
  rank/level from the trusted total instead of trusting the client's. It clamps
  past S-Rank, because the level is taken modulo 100 and would otherwise wrap
  and show a maxed player as Lv 1.
- **The baseline is grandfathered once** and keyed on `typeof baseline ===
  "number"`, **not** on the document existing — `recordExpEvent` creates that
  document with only `journalExp`, so an existing-document check would skip the
  baseline forever and wipe out everything earned before the journal shipped.
- **`recordExpEvent` recomputes the row from `expTotals` rather than
  incrementing it**, so a failed write is repaired by the next event instead of
  leaving the row permanently short.
- The queue lives in its own localStorage key, deliberately **outside** the
  synced state — the rules pin `state`'s allowed keys, and a queue inside it
  would sync between devices and upload twice.
- Tested by loading the real `functions/index.js` against an in-memory
  Firestore (see the session 5 commit) — including the migration cases, which
  are the ones that decide whether anyone's existing standing survives.

- **The journal is authoritative for the local number too**, not only the
  public one. `reconcileExpWithServer` (main.js) reads `expTotals` and calls
  `SYS.reconcileExpTo`, so an edited local figure does not survive the next
  sync. It **only runs when the outgoing queue is empty** — correcting while
  our own events are unsent would delete work genuinely done offline, which is
  the one mistake this must never make.
- **`reconcileExpTo` falls back to setting the standing outright** when the
  delta cannot be walked back: undoing a level replays the record that made
  it, and a hand-edited state has levels no record exists for, so the reversal
  runs out of history and floors at zero. Tested both directions.

- **Entries are checked against prices the evaluator issued.** `evaluateTask`
  records what it charged under `aiPrices/{uid}/prices/{id}` (server-only) and
  returns a `priceId` the task then carries; an entry may not exceed the price
  it names. Unverified entries are **counted, not refused** — every task made
  before this has no price to point at, and refusing those would freeze the
  standing of anyone already using the app until they rebuilt their task list.
  The split is shown on the admin page. Once old tasks age out this could
  become a refusal; it deliberately is not one yet.
- **`expTotals.months`** holds per-month EXP, incremented by the same trigger.
  That is what the Stats page's **All time** view reads — one document read
  rather than replaying thousands of entries, so it stays cheap as the record
  grows. It exists because the app prunes local history on purpose (80 log
  entries, 120 days of daily stats, one week of habit repeats), which left the
  long run nowhere to live.

**What this does and does not close.** The public number now moves only through
entries that are server-timestamped and permanent, so inflating it takes forged
events that stay on the record and can be audited, rather than one invisible
edit to local storage. It is not yet *validated*: nothing checks an event's
delta against a price the AI actually issued. That is the next step, and it
needs `evaluateTask` to record what it prices.

## Known limitation (accepted, documented)

`users/{uid}`'s `player.exp`/`level` are still written by the client's
normal sync, so a technically savvy user could inflate their own stats via
devtools. What *is* guaranteed is that nothing is self-*priced* any more —
every value comes from the AI or an admin.

Closing it fully means moving EXP-granting server-side and making the
client's EXP fields read-only. **Revisit before real money is attached to
rankings.**

**Largely addressed in session 5 by the EXP journal above — read that first.**
The client can still write anything into its own `player.exp`, but that number
no longer reaches the leaderboard.

**Session 5 note: the leaderboard is live, so this limitation is now public
rather than private.** Inflated stats used to be a private lie; they now
appear in a ranking other people read. The mirror sanitises and clamps
everything it copies, so a malformed or hostile document can't break the page
for everyone — but that is robustness, not anti-cheat. Nothing about the board
makes the underlying hole worse technically; it raises the stakes. **Worth
putting to the user directly** rather than waiting for money to be involved.

---

## Gotchas that cost real time — don't rediscover these

- **Google sign-in must stay `signInWithPopup`.** `signInWithRedirect`
  silently never completes: it relies on a cross-domain storage relay that
  modern Chrome breaks. No error surfaces. Don't "fix" it back.
- **The console error "An unknown error occurred when fetching the script"**
  is the sandbox's inability to register service workers. It appears on
  every single run. Not a real bug.
- **`t` shadowing.** `js/ui.js` aliases `SYS.t` to `t`, which collides with
  the conventional `t` used for the task/category being mapped. Inside any
  `.map((t) => …)` you must write `SYS.t(...)`. This surfaces as "t is not a
  function" only on pages that map over tasks — a spot check of one page
  misses it. When touching i18n, render **every** page and modal.
- **Adding a state field re-triggers the sync prompt** unless it goes
  through `normalizeState`, which is applied to both sides before comparing.
- **Structured-output schemas take a narrow subset of JSON Schema.** `type`,
  `properties`, `required`, `additionalProperties`, `items`, `enum`,
  `description` — and nothing else. `minimum`, `maximum`, `minItems`,
  `maxItems`, `pattern`, `default`, `oneOf`, `$ref` and a `number` type are all
  **rejected with a 400 before the model ever runs**. Bounds go in code after
  the response. This shipped broken twice: `EVALUATION_SCHEMA` carried
  `minimum: 1` from the day it was written and every call it made had been
  failing unnoticed, and the suggestion schema then inherited it by being
  copied from something assumed to work. **Run `node scripts/check-schemas.js`
  after touching either schema** — it reads the shipped source and exits
  non-zero on a rejected keyword.
- **The compat Firebase SDK has no `count()` aggregation.** Confirmed:
  `query.count` is `undefined` in 10.14.1. The modular build has it, but
  this app loads Firebase through plain `<script>` tags and must keep working
  from `file://`, so switching isn't an option. There's no `select()`
  projection in the web SDK either — counting rows means fetching them, which
  is why `fetchMyRank` does a capped scan. Don't "fix" it back to `count()`
  without checking it exists first.
- **The service worker used to serve mid-deploy error pages as scripts.**
  Fixed in session 5, but understand it before touching `sw.js`. `fetch()`
  rejects only on a *network* failure; a 404 or 500 resolves normally, and
  GitHub Pages serves both for a second or two while a push rolls out. The old
  handler returned that response as-is, so the page got an HTML error document
  where `js/ui.js` should have been — and a classic `<script>` that fails to
  parse fails **silently** without stopping the ones after it. The app then ran
  with `SYS.renderSidebar` undefined and died at first render, stuck on
  "SYSTEM INITIALIZING...". It also **cached** the error page under that
  filename, so the breakage outlived the deploy. Symptom to recognise: the app
  hangs on the splash screen after a deploy and a second refresh fixes it.
  Never return or cache a response without checking `res.ok`.
- **Boot failures are visible and self-healing now.** A throw during boot
  paints an error screen naming the file and line (deliberately dependency-free
  — no `SYS.t`, no theme vars, English only: a screen explaining a breakage
  must not be built from the parts that might be broken). Before painting it,
  boot clears the caches, unregisters the worker and reloads **once**, guarded
  by a `sessionStorage` flag so a reproducible crash can't loop.
  **A blank splash screen is now a bug report — ask the user to screenshot it.**
- **Service workers cannot be registered in the sandbox at all** — caches stay
  empty and `navigator.serviceWorker.ready` never resolves. Anything in
  `sw.js` has to be tested by running its handler against mocked
  `fetch`/`caches` in Node (see the session 5 commit), plus a local server
  that can return a 503 on demand to reproduce the page-level symptom.

---

## Working conventions
- Test in the browser tool before pushing: serve on a fresh port, clear
  `localStorage`, exercise the feature, check the console.
- Render functions in `js/ui.js` are pure `(state, ui) → HTML string`; all
  event wiring is in `js/main.js` via delegated `data-action` handlers.
  `<select>` and colour inputs fire **change**, not click.
- Everything user-supplied goes through `escapeHtml()`.
- Destructive actions reuse the arm/disarm "click again to confirm" pattern
  (`ARMABLE` in `js/main.js`).
- For multi-string edits, write a Node script to a scratchpad file and run
  it rather than inlining in Bash — the shell mangles backticks and `${}`.
- After pushing, verify with `git log --oneline -1 origin/main`.
- Commit messages explain *why*, not just what.
