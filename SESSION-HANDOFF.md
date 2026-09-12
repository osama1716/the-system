# The System — Handoff (last updated session 8)

Read this first. It should be enough to pick up cleanly without re-reading
any old conversation. Sessions 1–2 built the local app, session 3 added the
backend and admin platform, session 4 added AI task evaluation, appeals,
seven languages, and unique display names. Session 5 built the global
leaderboard — the last item from the original plan. Sessions 6–7 fixed the
two ways the standing was being measured.

**Session 8 rebuilt the habit system**, which is now the largest part of the
app: amounts and a keypad, seven schedule shapes, per-day notes, a library of
ready-made habits, quit habits, the timer (stopwatch/countdown, three faces,
sounds), reminders over Web Push, and navigation between days. It ended with
a full audit — see "Session 8" below for what that found and what it fixed.

---

## ⚠️ Read this before you try to run anything

**Your sandbox is NOT the user's machine.** They share a username
(`osama-pc\osama`) and look identical, but they are two different
filesystems. Session 3 lost ~30 minutes to this: `winget install nodejs`
and `npm install -g firebase-tools` succeeded *in the assistant sandbox*,
and the user then got "command not found" on their real machine.

- **Work in `C:\Users\osama\Downloads\the-system\`.** That is the real repo
  and the one with the git remote. An older assistant-side copy exists at
  `C:\Users\osama\Downloads\files\the-system-app\` and is **abandoned and
  many commits behind** — session 8 lost time to it, because the preview
  server's config still pointed there and it happily served a version of the
  app from before the sound and push files existed. If a file you just wrote
  is not in the page, check which directory is being served before you check
  anything else.
- **GitHub is the shared channel.** You edit + commit + push; they
  `git pull`. That part works fine.
- **You may be able to deploy — check.** This was false as of session 7: the
  Firebase CLI was present and logged in as the admin account, and deploys ran
  from here. Run `firebase login:list` before assuming either way. Deploying
  is outward-facing, so ask first regardless.
- **Both repo paths may exist on one filesystem, and they can disagree.**
  Session 7 opened on a checkout six commits behind and a handoff a version
  old. `git fetch` and compare both before starting.
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
Firestore + 18 Cloud Functions, and the Claude API for task pricing.

## Origin (why the data looks the way it does)
- The 8 intelligence categories and their starting traits/levels in
  `js/constants.js` are the user's **real data** from a Notion workspace
  they kept before this existed. Preserve it.
- `EXP = Pt` (divisor 1) is deliberate. `3 skill points per level` is **gone** —
  points come from EXP at a rate per rank now (`SYS.RANK_POINTS_PER_100_EXP`).
  Don't restore it; tying points to levels is what made a month of drinking
  water someone's strongest physical trait.
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
- Ranks G→S, 100 levels each. **A level costs what its rank says** —
  `SYS.RANK_LEVEL_EXP = [15,30,50,75,100,130,170,200]`, G→S. Not a flat 100.
- **Fully symmetric EXP ledger** via `state.levelHistory` — undo takes back
  exactly what was granted, including un-investing the specific trait.
  **Don't regress this.** Every change to EXP paths gets round-trip tested.
- 8 intelligence categories + user-added ones; **skill points now go to the
  trait the work actually built** (see traitComposition below), falling back
  to weakest-trait when there's no AI-assigned target.
- Quests (one-off) and Habits (recurring). The habit system is session 8 and
  is the biggest thing in the app now:
  - **The day is the unit.** `task.days["YYYY-MM-DD"] = { n, amount, note?,
    slip? }`. One tick per day, not a count per week. **Every write to a day
    must spread the existing entry** — a write that replaces it eats whichever
    sibling field it did not know about, and that bug has been found twice.
  - **Amounts** are integers in the family's smallest unit (`SYS.UNIT_FACTOR`,
    `toBase`/`fromBase`), so 1.5 L is 1500 and nothing drifts.
  - **Seven schedules**, two families: *fixed* (daily, weekdays, monthDays,
    interval) name their days; *quota* (perWeek, perMonth, perInterval) count a
    window. `SYS.weeklyRate` is the one comparable number the evaluator prices
    against. `sanitizeSchedule` **must stay a fixed point** — `migrateSchedule`
    decides "did anything change" by comparing before and after, so an unstable
    sanitiser becomes a sync conflict that never resolves.
  - **Notes** per day (`MAX_NOTE_CHARS = 280`), **quit habits** (a clean day
    pays, a slip takes that day back), and a **library** of 26 presets whose
    prices are cached globally per preset-and-schedule.
  - **The timer** on any time-unit habit: stopwatch or countdown, three faces,
    progressive saving every 15s, restored across reloads, ten focus sounds and
    six end chimes.
  - **Day navigation**: the week strip is clickable and the arrows move a week.
    Past days can be logged; future days are read-only, enforced both on the
    button and in the action.
- Stats week/month views, backed by a symmetric per-day ledger.
- PWA with offline cache; prompts to reload when a new version ships. The
  fetch handler caches every same-origin file it serves, so the sound
  recordings become available offline after being played once.
- Notifications can be **sticky** (wait to be dismissed) and can **carry an
  action button** — added for the update prompt, reusable.
- **Audio is the timer's only** — focus sounds and an end chime, off by
  default. There are no UI sound effects and no music; don't add any. Sound
  files are **CC0 only**, sourced in `assets/sounds/CREDITS.md`, and never
  taken from another app.
- **Reminders** over standard Web Push (not FCM): a time per habit, a
  five-minute scheduler, one notification per device listing what is due.

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
- `SYS.totalExp(player)` flattens rank/level/exp into one sortable number by
  **summing the ranks already crossed at their own cost** — *not*
  `(rankIdx*100 + level-1)*100 + exp`, which is the pre-curve formula and is
  wrong. `totalExpOf` in `functions/index.js` computes the same thing —
  **change them together, and verify it.** Session 5 changed one and not the
  other; they then disagreed on 39 of 40 standings and produced a sync prompt
  on every launch that took two sessions to trace. See the session 7 section.
  Now checked across 3200 standings.
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
- `users/{uid}/pushSubs/{id}` — one row per device that asked for reminders.
  Owner read/write/delete, **shape- and size-checked** the way the state
  document is; the scheduler reads them with the Admin SDK, which bypasses
  rules. An endpoint is a capability to notify that person, so nobody else —
  admin included — can read them.
- `libraryPrices/{presetId__scheduleKey}` — **deliberately has no match
  block.** Written only by `priceLibraryHabit` through the Admin SDK. The
  absence is the rule; there is a comment in `firestore.rules` saying so, so
  nobody "fixes" it by opening it up.
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

### Cloud Functions (`functions/index.js`, 22, 2nd gen except onUserCreate)
18 callables: `claimUsername`, `checkUsername`, `backfillUsernames`,
`lookupUser`, `resolveUsers`, `backfillLeaderboard`, `backfillExpBaselines`,
`setAdmin`, `getAdminStatus`, `backfillUserDirectory`, `resolveAppeal`,
`rejectAppeal`, `applyAdjustment`, `suggestQuests`, `evaluateTask`,
`priceLibraryHabit`, `sendTestPush`, `pushConfig`.

Plus three triggers — `onUserCreate` (Auth), `recordExpEvent` and
`mirrorLeaderboard` (Firestore) — and one schedule, `sendReminders`, every
five minutes.

Every admin one gates on `!request.auth || request.auth.token.admin !== true`,
which is null-safe: an unauthenticated call is rejected rather than throwing.
`pushConfig` is the single function with no auth check, on purpose — it returns
the VAPID *public* key, which the browser sends to the push service anyway.

### Secrets
Two, both Firebase secrets (`firebase functions:secrets:set`), never in the
repo — this is a public GitHub Pages project:
- `ANTHROPIC_API_KEY` — the evaluator.
- `VAPID_PRIVATE_KEY` — signs push sends. The public half is committed in
  `functions/index.js` and is meant to be. Replacing the pair invalidates
  every existing subscription.

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

## Session 8 changelog

The habit system, then an audit of everything.

1. **Amounts and a keypad.** The `+` moved onto the main button, and logging
   an amount is a dial with a ring, a stepper and a calculator keypad.
2. **Seven schedules** (`scheduleOf`, `sanitizeSchedule`, `isDueOn`,
   `periodBounds`, `periodProgress`, `nextDueOn`, `weeklyRate`), with a
   schedule-aware streak that knows whether it is counting days or windows.
3. **Per-day notes**, marked on the day's dot and listed in the log sheet.
4. **The library**: 26 presets in six categories, priced once globally per
   preset-and-schedule. The catalogue exists in two places by necessity
   (`js/constants.js` and `functions/presets.js`) and a test asserts parity.
5. **Quit habits**: a clean day pays, a slip takes that day's EXP back.
6. **The timer**, rebuilt across several rounds of the user trying it:
   progressive saving instead of "stop and log", a countdown showing what is
   left of the day, three faces, and real CC0 sounds. Traps hit on the way:
   Ogg is undecodable in Safari's Web Audio (converted to MP3); a full modal
   re-render every second reset the sound list's scroll; the ring formula was
   duplicated and diverged; flooring both halves of a countdown lost a second.
7. **Reminders** over Web Push, with the schedule rules mirrored server-side
   in `functions/reminders.js` and 1,785 combinations tested against the
   client's copy.
8. **Moving between days**: the week strip became navigable.
9. **A full audit.** Four audit scripts and ~7,700 randomised cases against
   the ledger and the migrations. Nothing in the app was broken. What it did
   find, and what was done:
   - These docs described an app that no longer existed — six features
     missing from both. Fixed: this section, the feature set, the collections,
     the function count, and the README.
   - A failed local save was a console warning and nothing else. The app kept
     working and lost everything on reload. Now says so once, and takes it
     back if a later save succeeds. The likely trigger is not a full quota
     (the state is ~8 KB, with a realistic ceiling of 1–2 MB) but a browser
     refusing site data at all.
   - `.chip-row` had no CSS rule, so the "build / quit" label sat six pixels
     below its chips. One rule.
   - `pushSubs` was the only owner-writable collection with no shape check.
     Now checked like the state document is.
   - `libraryPrices` has no rule on purpose; that is now written down.
   - `data-action="noop"` on two selects was doing nothing and reading like a
     bug. Removed — `data-bind` is handled on `input` and never looked at it.
   - The design-handoff folder and the zip are gitignored; the helper scripts'
     lockfile is committed.

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

### 0. Groups (asked for, deferred twice by the user)
Shared habits between people. The user has named it twice and both times said
"not yet". Nothing is designed beyond the name — ask before assuming a shape.

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

## Read this first: how one bug took six attempts

A habit named "drink water" kept crediting the wrong trait — Yoga, then
Self-defence, then Handcrafts. It took six wrong fixes to find, and the
reason it took six is worth more than the fix.

**The fault was never where the symptom pointed.** Every attempt went after
how the trait is *chosen*: the evaluator's prompt, whether it could see the
person's trait list, how the returned name is matched. All of those were
working. The fault was one step further on — in what the chosen name was then
*used for*. Points were allocated from a pool of unconverted EXP shared
across the whole category, so whatever earlier tasks had left in it competed
with the work being done and usually outweighed it.

**What went wrong in the diagnosis, in order:**

1. I reasoned about the code instead of asking which path the reported action
   actually takes. Logging an existing habit never calls the evaluator, so
   several fixes could not possibly have applied. One question — "which code
   path does the button they pressed run?" — would have saved most of it.
2. I shipped hypotheses. I cannot sign in to their account, call the AI, or
   read their Firestore, so every fix was a guess dressed as a diagnosis. The
   moment to say "I cannot see this, let me make the app show it" was attempt
   two, not attempt six.
3. Once the app *did* show it (`BUILDS <trait>` on every task row), the
   answer arrived in one message. Build the diagnostic early; it is cheaper
   than a wrong fix and it usually earns its place in the product anyway.
4. Three separate bugs produced the same symptom — no target at all, a target
   naming something that doesn't exist, and a target that matches but is
   ignored. They are indistinguishable after the fact. Anything with that
   shape needs the app to say which one it is.

**The escaping trap, which bit three times.** Writing `\p{L}` inside a JS
template literal eats the backslash: the class becomes `[^p{L}p{N}]`, which
strips nearly everything, folds every name to the empty string, and makes all
names compare equal. Nothing throws — the wrong answer just looks confident.
There is now one shared `SYS.normaliseName`; do not write a second copy. When
generating code through a script, use `String.raw`.

**Two sync traps, same shape.** Anything added to state during load must be
*deterministic*, because `normalizeState` runs on both the local copy and the
pulled one, and any difference makes `deepEqual` fail and shows the "which
copy do you want to keep?" prompt on every launch, for ever. Both offenders
were mine: a random UUID for a seed-added trait, and a field present on one
copy and absent on the other. Also: a save that fails only warned to the
console, so a rules rejection looked like a sync quirk rather than nothing
having been saved for days — it is now surfaced on screen.

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


## How skill points are allocated (session 5) — the part that kept breaking

- **Points come from EXP, not from levels.** `SYS.RANK_POINTS_PER_100_EXP`
  is the rate per rank; `SYS.pointsForLevel(rank)` converts it to what one
  level is worth. Awarding per level keeps undo exact, because the level
  history already knows how to reverse a level. Tying points to levels
  directly is what made a month of drinking water the strongest physical
  trait a person had — a G-Rank level costs 15 EXP and an S-Rank one 200.
- **A task that names a trait decides where its own points go.** The running
  pool (`player.traitComposition`) is consulted *only* for work that named
  nothing. Do not go back to reading the pool for targeted work: that is the
  bug above.
- **Fractions bank per trait** (`intelligences[k].traitRemainder`, keyed by
  trait id), not per category. Pooling them meant a whole point went to the
  heaviest trait in the category, which is not necessarily the one that
  earned it. `intelligences[k].remainder` is kept as the sum, because the
  Intelligence page shows it.
- **Undo must restore the per-trait banks**, not just the category figure —
  the level-history snapshot carries both, and reads an older numeric
  snapshot as the category figure.
- **Every category ships with `traitRemainder: {}`.** A copy that has the
  field beside one that does not compares unequal; see the sync trap above.
- **Seed tasks carry `traitTargets`.** They predate AI evaluation and had
  none, so logging one fell through to the weakest trait. Existing accounts
  are filled in on load by `SYS.syncSeedTaskTargets`, matched on title, only
  where a task has no target of its own.
- **Every task row shows `BUILDS <trait>`** — or "no such trait here", or
  "wherever you're weakest". Keep it. It is what finally made the failure
  visible, and it tells anyone what a habit is for.
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

## Session 7: the standing was measured two different ways

The "which copy do you want to keep?" prompt came up on every launch for two
sessions. **Read this before touching EXP, sync, or `functions/index.js`.**

**The cause was one missed edit.** Session 5 re-priced levels per rank
(`SYS.RANK_LEVEL_EXP = [15,30,50,75,100,130,170,200]`). `totalExpOf` in
`functions/index.js` was left on the old flat `(rankIdx*100 + level-1)*100 + exp`
— even though both copies carry a comment saying they must change together.
They disagreed on **39 of 40** standings.

That is not cosmetic. `reconcileExpWithServer` does
`serverTotal - SYS.totalExp(state.player)`. In two different units the
difference is never zero, so it "corrected" the standing on **every load**,
rewrote `player`, and guaranteed the stored copy disagreed. It also decided the
order of the public leaderboard.

**If you change one, change the other, and run the check.**
`scripts/` has no test for this yet; the session used a throwaway script that
loads the shipped `engine.js` and the real `totalExpOf` and compares all 3200
standings. Worth making permanent the next time either is touched.

Four more faults, all downstream of the same missed edit:

- **`expTotals.baseline` was grandfathered with the old formula**, so every
  stored baseline was inflated. `backfillExpBaselines` (admin) converts them
  exactly — the old encoding is invertible because the old sanitiser clamped
  exp to 99 and level to 100. Idempotent by a stored `baselineCurve` stamp,
  **not** by the arithmetic being safe to repeat: running it twice deflates a
  standing as badly as the bug inflated it.
- **`sanitizePlayer` clamped exp to 0..99** while a B/A/S level costs
  130/170/200 — silently deleting up to 100 exp from the hardest ranks.
- **`normalizeState` wrote a log line when it migrated something**, into the
  copy it was about to compare. That line only lands on the copy that needed
  migrating, so a migrated copy and a stale one could never compare equal.
  **This is the third instance of the trap already written down twice.** The
  rule is stronger than "make it deterministic": normalizeState's output must
  be a pure function of its input. A record of *what this call did* can never
  be, so it does not go in the state at all — each caller passes its own
  report and the boot one is shown as a notification.
- **A deadlock with no exit.** Once the device matched the journal exactly,
  `reconcileExpWithServer` found nothing to correct and returned before
  saving — and the conflict branch deliberately never pushes. So the single
  condition that raises the prompt also removes every path that could answer
  it. `resolveOrAsk` now treats "device matches the journal, stored copy does
  not" as staleness and writes instead of asking. Only EXP is settled this
  way, because only EXP has a record to check against; the other three cases
  still ask.

### What made this take two sessions

The first diagnosis was wrong and cost a session: no red "can't save" box was
showing, so saving was assumed to work. **It proved nothing.** `push()` has
three exits and only one of them can report — `!currentUser` returns silently,
a later call cancels the pending write silently, and a write that is never
started cannot fail. Absence of an error is not evidence of success anywhere in
this codebase.

What actually worked, again, was making the app say it. The sync prompt now
lists which top-level keys differ, and for admins shows device / stored /
journal totals, pending grants, unsent events, when the document was last
written, and counters for every push outcome. **Keep all of it.** Each screen-
shot of that panel killed a wrong hypothesis in one message.

### Two traps found the hard way

- **`resolveOrAsk` ends in `.catch(() => ask())`.** Anything that throws in the
  success path falls through to the prompt — the exact failure being fixed. A
  commit that added a cross-file call inside it (`SYS.Cloud.pushNow`) brought
  the prompt back and was reverted. Don't put new cross-file calls inside a
  catch-all whose fallback is the bug.
- **The service worker serves a stale cached copy for any file the network
  answers with a non-ok status** — and GitHub Pages returns non-ok for a few
  seconds mid-rollout. So a fresh `main.js` can run against a cached
  `cloud.js`. Any new function called across files is undefined for that
  window. This is by design (see `sw.js` — a stale real file beats a fresh
  error page) and it will not change, so write cross-file calls defensively.

### Still unexplained, and not fixed

During investigation the counters showed a write that **neither resolved nor
rejected** — `1 started, 0 ok, 0 failed` — while reads on the same document in
the same session worked, with offline persistence disabled. `users/{uid}` went
17 days without being written. It resolved itself once the fixes above landed
and has not recurred. If a save ever appears to vanish again, look here first:
`BUG-REPORT-sync-prompt.md` in the repo root has the full write-up.

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
