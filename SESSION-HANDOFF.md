# The System — Handoff (session 2)

Continuation of the original build. This doc exists because the prior chat
session ran low on context — read this first, it should be enough to pick
up cleanly without re-reading the whole old conversation.

## Where everything lives
- **Local files**: `C:\Users\osama\Downloads\files\the-system-app\`
- **GitHub repo (public)**: `https://github.com/osama1716/the-system`
- **Live app**: `https://osama1716.github.io/the-system/` — installable as a
  PWA (Add to Home Screen), auto-updates from GitHub Pages, no reinstall needed.
- Git identity used for commits so far: a placeholder (`"The System"
  <dev@localhost>`) — no global git config was touched. Change it if the
  user cares.

## What the app is
A Solo Leveling–style personal growth tracker, originally built from the
user's real Notion workspace. Zero-build, zero-dependency — plain HTML/CSS/JS,
classic `<script>` tags (no bundler, no ES modules for the app's own code —
important because it must keep working via plain `file://` double-click, not
just when served over http).

## Origin (why the data looks the way it does)
The user maintained a real Notion workspace before any of this existed:
- **SYSTEM Ranks** database (Rank/Level/Exp), **SYSTEM Tasks** database
  (task name, priority, task type, intelligence-type tags, Pt value,
  completion %, notes), 8 **INTELLIGENCE** sub-databases (one per category,
  each row a named trait with an integer level), and a **STATISTICS** log
  of level transitions with free-text notes on what caused them.
- The 8 categories and their real starting traits/levels (Self, Social,
  Linguistic, Logical-Mathematical, Bodily-Kinesthetic, Natural,
  Visual-Spatial, Musical, each with Arabic names too) are seeded into
  `js/constants.js` exactly as they existed in that Notion workspace — this
  is the user's actual real data, not placeholder content. Preserve it.
- `EXP = Pt` (divisor 1) and `3 skill points per level` were both explicit,
  deliberately-chosen mechanics the user asked for and later corrected (an
  earlier ÷20 divisor was a mistaken carryover and was fixed to ÷1 — don't
  reintroduce a divisor without being asked).
- The visual design (Bronze dark / White & gold, Outfit + IBM Plex Mono, one
  gold accent, ring-based level display) was handed over as a separate
  design-reference doc (`.dc.html` prototype + README) built around a
  different but related concept app ("The System" — daily quests, gates,
  party) — only the *visual system* was adopted; the gates/party mechanics
  were not, since they don't map to this app's actual feature set.
- Notion sync (pushing/pulling this app's data to/from the original
  workspace) was raised early on as an open question and was **never
  pursued** — the app and Notion remain two separate, unsynced sources of
  truth. Only bring this up if the user does.

## What the user actually wants (read this to understand intent, not just state)
This is a personal project the user cares about a lot and keeps iterating on
in detail — not a quick throwaway. Patterns worth knowing:
- They give specific, opinionated feedback (down to exact label wording,
  color choices, and UI density) and expect it followed precisely, not
  approximated. When their instruction is ambiguous, they'd rather you make
  a concrete, reasoned judgment call and build it than ask — but say clearly
  what you decided and why, so they can correct it.
- They want this to eventually be usable by other people, and are actively
  working toward it: pushed the repo to GitHub, made it an installable PWA
  so it updates automatically, and are now adding real accounts/cloud sync
  so progress isn't stuck on one device. The "make it public + submit to
  app stores" idea (see below) is the next rung of that ladder, just not
  started yet.
- They care about correctness of the underlying game-logic ledger (the
  symmetric EXP/undo system) as much as visual polish — this was requested,
  tested, and re-verified multiple times across the project. Treat bugs in
  that system as high priority.
- They're non-technical about the infrastructure side (git, GitHub, Firebase
  console) but technical enough to give precise product feedback — bridge
  that gap with literal step-by-step instructions for infra, and don't
  over-explain the product decisions.

## Full feature set (as of this handoff)
- **Ranks/levels/EXP**: G→S ranks, 100 levels each, 100 EXP/level.
  `Pt` on a task **is** its EXP directly (`expDivisor` setting, default 1).
- **Fully symmetric EXP ledger**: raising completion% grants EXP/levels/skill
  points; lowering it takes back the *exact* same amount, including
  un-investing the exact trait a level-up gave a point to, and reversing
  rank-ups. This is implemented via `state.levelHistory` — a stack of exactly
  what each level-up granted, popped and undone precisely on the way back
  down. This precision is a big deal to the user — don't regress it.
- **8 Intelligence categories**, each with editable traits (add/remove),
  plus user-addable custom categories. Skill points on level-up are
  distributed proportional to which category the underlying EXP was tagged
  with, invested into that category's currently-weakest trait, with
  fractional remainders banked (never lost) across future level-ups.
- **Quests** (one-off tasks: Short/Medium/Long Term, priority, gradual %
  completion via a drag slider + ±5% steppers, or simple/all-at-once) — own
  page, separate from Habits.
- **Habits** (recurring tasks) — own page. Configurable repeats/week (1–7),
  a unit (Count/Time/Volume/Distance/Weight groups, or free-text custom),
  amount per repeat. Logging a repeat awards flat EXP immediately and is
  individually undoable. Time-unit habits (sec/min/hr) get a **live timer**
  modal (start/pause/stop, logs actual elapsed duration). Week counts reset
  on the real ISO week boundary, including auto-refreshing at midnight if
  the app is left open (`scheduleNextDayRollover` in main.js).
- **Stats page**: week view = 7-day XP bar chart (Mon–Sun, 3-letter labels);
  month view = vertical day-by-day list, each row a horizontal bar showing
  that day's % of habits touched. Both navigable to any past/future
  week/month, with "Today · M/DD" always shown and the year separate.
  Backed by `state.dailyStats`, a per-day ledger that's also symmetric
  (undo un-bumps the correct day).
- **Intelligence radar** (Overview page) + a big conic-gradient level ring.
- **Two themes** ("Bronze dark" / "White & gold"), exact palette from a
  design handoff doc the user supplied earlier — Outfit + IBM Plex Mono
  fonts, one gold accent instead of a rainbow of colors, tonal rounded
  cards, no shadows. Switchable in Settings, persisted.
- **PWA**: manifest, service worker (network-first, cache-fallback — every
  online visit fetches fresh files so edits reach the phone without
  reinstalling), generated icons.
- **No sound effects, no music** — both were built earlier in this project's
  life, then explicitly removed by the user's request. **Do not re-add
  either without being asked again** — this was a deliberate "I didn't like
  them" removal, not an oversight.
- **Cloud sync (Firebase)** — just wired up this session, see below.

## Cloud sync — current status
- `js/cloud.js`: Firebase Auth (email/password) + Firestore, loaded via
  compat SDK CDN `<script>` tags (not ES modules, for the file:// reason
  above). Fully optional — everything no-ops gracefully if unconfigured or
  offline; local-only mode is unchanged.
- `js/firebase-config.js`: **now has the user's real project config**
  (project id `the-system-44ff7`). This is intentionally public/committed —
  Firebase's security model puts the real protection in Firestore rules,
  not in hiding this file.
- Sync model (deliberately simple, not a live/realtime connection):
  debounced push to Firestore after every local change; a "pull if newer"
  check on tab/app focus regain. Sign-in reconciliation: if the account
  already has cloud data, the user is asked which copy to keep (never
  silently overwritten); if not, local data uploads automatically.
- **Verified this session**: the config is real and reaches Firebase
  (tested via a deliberately-failing sign-in attempt that returned a proper
  `auth/invalid-credential` from Firebase's servers, not a config error —
  confirms apiKey/project/Auth are correctly wired, with no test account
  left behind).
- **Not yet verified**: a real sign-up + a second-device sign-in, i.e. the
  actual end-to-end sync UX. The user should try creating a real account
  from the app (Settings → Account & sync) as the next step.
- **Should double-check**: whether the Firestore security rules were
  actually clicked-**Publish**ed. This got hardened in a later session (see
  "Security hardening" below) — the rules now also validate the shape/size
  of what's written, not just ownership — and live in the repo at
  [`firestore.rules`](firestore.rules) instead of only in this doc, so they
  stay in sync with the app's actual state shape. If sign-up/sign-in works
  but writes silently fail, check that this exact file's contents were
  pasted into Firebase console → Firestore → Rules tab and **Published**
  (README's "Cloud sync setup" step 4 has the full walkthrough).

## Security hardening (session 3)
Requested as an explicit security review + "fix everything you found."
All four findings were fixed, tested in-browser (including a live exploit
attempt for the first one, to empirically confirm it's actually closed —
not just reasoned about), committed, and pushed:
1. **Category-color XSS via import** — `SYS.sanitizeColor` (`js/constants.js`)
   now validates every color at every entry point (boot load, JSON import,
   cloud pull, new-category form) before it's ever rendered into a `style=`
   attribute; render sites also escape it as a second layer. Verified by
   importing a crafted backup with a color value designed to break out of
   the attribute and inject `<img onerror>` — confirmed it gets neutralized
   to a safe fallback and never reaches the DOM.
2. **Firestore rules had no schema validation** — now versioned in-repo at
   `firestore.rules`, adds shape/key-allowlist/size checks on top of the
   existing owner-only auth check. **Still needs the user to paste this
   file's contents into Firebase console → Firestore → Rules → Publish** —
   I can't click that myself. If the state shape in `defaultState()`
   (`js/constants.js`) ever changes, this file's key allowlist must be
   updated to match or sync will silently start failing.
3. **No App Check** — wired up (`js/cloud.js`), off by default via a
   `"PASTE_ME"` placeholder in `js/appcheck-config.js`, same pattern as
   `firebase-config.js`. **Still needs the user to register it in Firebase
   console** (Build → App Check → register web app → reCAPTCHA v3 → paste
   the site key it gives them into that file) **and should leave enforcement
   off until they've confirmed real sign-in traffic shows as verified** —
   flipping to Enforce too early can lock out real users. Full steps are in
   README's Cloud sync setup, step 6.
4. **No password reset / email verification** — added "Forgot password?" on
   the sign-in form and an automatic (non-blocking) verification email on
   sign-up, with a resend link shown in Settings while unverified.

## Explicitly deferred / open decisions (don't just start building these)
1. **Google/Apple sign-in** — user asked about this. Google is easy (just
   enable it as a provider in Firebase console, then I add a button) and
   was left for "after email/password is confirmed working." Apple sign-in
   needs a paid ($99/yr) Apple Developer account — flagged as probably not
   worth it unless the user already has one. Neither is built yet.
2. **Going public + App Store / Google Play** — the user floated this
   mid-session ("i want to make this app public in the future and even try
   to put it inside apple store and google play"). Explicitly deferred to
   "think about this later" — nothing built or decided. When it comes up
   again, remember it implies: possibly wrapping as a native/installable
   app (Capacitor or similar, since this is a PWA), developer account costs,
   a real privacy policy (now handling real users' emails/passwords via
   Firebase Auth), app store review requirements, and — ties back to an
   earlier decision — copyrighted music is off the table the moment this is
   genuinely public (same reasoning that killed the "add official songs"
   idea earlier: a public GitHub Pages repo hosting unlicensed audio is
   public distribution, not personal use, regardless of intent).
3. **Repo privacy** — user explicitly chose to **stay public** (to avoid the
   GitHub Pro cost private-repo Pages would require) and therefore also
   confirmed **no officially-licensed/copyrighted music** — instead removed
   all sound/music entirely per separate feedback. If they ever want real
   copyrighted tracks, that conversation needs to restart from "repo must
   go private, needs GitHub Pro" territory.

## Working conventions established this session (keep following these)
- Every git commit uses `GIT_AUTHOR_NAME="The System" GIT_AUTHOR_EMAIL="dev@localhost"`
  env vars on the commit command itself — never touch git config (global or
  local), per standing instructions.
- Test thoroughly in the Claude Browser tool (`python -m http.server` on a
  fresh port, navigate, `localStorage.clear()`, exercise the feature,
  check console) before pushing. This sandbox's headless browser cannot
  register service workers ("An unknown error occurred when fetching the
  script" in the console is that specific known limitation — not a real bug,
  seen on every single test run) — don't chase it.
- After pushing, verify with `git log --oneline -1 origin/main` rather than
  trusting the push command's own output blindly.
- The user gives feedback in a mix of English and Arabic (Jordanian
  dialect) — respond in whichever fits, following their lead.
- The user is non-technical about git/GitHub/Firebase specifics and needs
  very literal, numbered, "click this exact button" instructions — abstract
  steps ("go to settings and enable it") have caused confusion twice now.
  Screenshots they paste in are the primary way to unblock them — read the
  screenshot carefully before responding, and if genuinely unsure what
  they're looking at, ask what they see rather than guessing.
