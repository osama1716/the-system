# The System — Handoff (written end of session 4)

Read this first. It should be enough to pick up cleanly without re-reading
any old conversation. Sessions 1–2 built the local app, session 3 added the
backend and admin platform, session 4 (this one) added AI task evaluation,
appeals, seven languages, and unique display names.

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
Firestore + 13 Cloud Functions, and the Claude API for task pricing.

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
- PWA with offline cache.
- **No sound effects, no music** — removed by request. Don't re-add.

### Cloud
- Auth: email/password + Google (**popup, not redirect** — see gotchas).
- Firestore sync: debounced push, pull-on-focus.
- App Check wired but **still `"PASTE_ME"`** — never configured.

### Admin platform
- Admin via unforgeable Firebase Auth custom claim.
- Admin page: look up any user **by display name or email**, view stats,
  promote/demote (two-click confirm), directory + username backfills.
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

**Firestore gotcha:** rules can't filter a list query, only allow/reject it
whole. A user's own "my X" query **must** include `.where('userId','==',
myUid)` or it's rejected outright.

### Cloud Functions (`functions/index.js`, 13, 2nd gen except onUserCreate)
`onUserCreate`, `claimUsername`, `checkUsername`, `backfillUsernames`,
`lookupUser`, `resolveUsers`, `setAdmin`, `getAdminStatus`,
`backfillUserDirectory`, `resolveAppeal`, `rejectAppeal`, `applyAdjustment`,
`evaluateTask`. All admin ones gate on `request.auth.token.admin === true`.

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

### 1. Phase 4 — the global leaderboard (last item from the original plan)
Design already worked out: `leaderboard/{uid}` public-readable mirror
`{displayName, level, exp, questsCompleted, updatedAt}` written **only** by
a Firestore `onWrite` trigger on `users/{uid}`. Deliberately **no stored
rank** — rank is a property of the collection; compute it client-side from
`orderBy('exp','desc')` position.

**The fairness question that blocked it is now largely resolved.** It was:
"do we need a separate Ranked EXP counter, since users set their own
values?" They no longer can — everything is AI-priced. So the personal
level is now defensible as the ranking number and a second counter is
probably unnecessary. **Confirm with the user before building**, and note
the remaining caveat under Known Limitation below.

Display names are now unique, which the leaderboard needed.

### 2. Theme designs from Claude Design
The user said they'd send palettes. The engine is ready: adding one is a
single object in `SYS.THEMES` and it appears in the dropdown automatically.

### 3. Username cooldown (discussed, deferred)
Releasing a name is currently **immediate**, which allows impersonation: a
known player renames, someone grabs their old name instantly. Standard fix
is a cooldown (keep the old record with an expiry instead of deleting it).
The user agreed to defer this until closer to opening signups publicly.

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

## Known limitation (accepted, documented)

`users/{uid}`'s `player.exp`/`level` are still written by the client's
normal sync, so a technically savvy user could inflate their own stats via
devtools. What *is* guaranteed is that nothing is self-*priced* any more —
every value comes from the AI or an admin.

Closing it fully means moving EXP-granting server-side and making the
client's EXP fields read-only. **Revisit before real money is attached to
rankings.** Worth raising again when the leaderboard is built.

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
- **The user may need a hard refresh** for changes to appear if the service
  worker fix (commit 3df11d7) turns out not to work — it could not be tested
  in the sandbox. Worth confirming on a future deploy that a normal reload
  now suffices.

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
