# The System

A Solo Leveling–style personal growth tracker: ranks, levels, EXP, an extensible
"Intelligence" stat system, one-off quests, and recurring habits — split across
seven sections (Overview, Quests, Habits, Stats, Ranking, Intelligence, Log) navigable
from the sidebar. Zero-build, zero-dependency — plain HTML/CSS/JS. Everything
is saved to your browser's local storage, so it works fully offline and needs
no account, server, or install. Installable as a PWA (works on your phone's
home screen, updates itself whenever this repo is redeployed — no reinstalling).

EXP is fully symmetric: raising a task's completion% grants EXP (and levels,
and skill points); lowering it takes the exact same amount back, including
un-investing any skill point that came from crossing that level, and rank-up
reverses the same way (as a quiet toast, not a fanfare — only rank-*up* gets
the cinematic moment).

Visuals follow the "Bronze dark / White & gold" design system (Outfit + IBM
Plex Mono, one gold accent instead of a rainbow of colors, ring-based level
display, tonal rounded cards) — switch between the two themes any time from
Settings; the choice is saved.

Quests can be one-off (live in **Quests**) or **recurring habits** (live in
their own **Habits** page), in whatever unit fits: count, time, volume,
distance, weight, or a custom label.

A habit is **one tick per day**, not a count per week. The day is what carries
the record — `task.days["2026-09-12"] = { n, amount, note, slip }` — and EXP is
granted the moment the day's goal is crossed and taken back if it drops below
again. Nothing is capped or penalised for going past the goal.

**Schedules** decide which days count, in seven shapes: every day, chosen
weekdays, N times a week, chosen days of the month, N times a month, every X
days, or N times every X days. The first four and "every X days" name their
days; the "N times" ones are quotas over a window. `SYS.weeklyRate` reduces any
of them to one comparable number, which is what the evaluator prices against
so "three times a week" cannot be worth the same as "every day".

**The library** offers 26 ready-made habits in six categories, each arriving
with its unit, amount and schedule already set. Their prices are cached
globally per preset-and-schedule, so the same ready-made habit costs one API
call for everyone who ever adds it, not one each.

**Quit habits** invert the question: instead of "did you do it", the day asks
"did you stay clean". A clean day pays and a slip takes that day's EXP back.

**Notes** are per day — the small pencil in the log sheet — because "why" is
the most useful thing anyone writes about a day they missed.

**Moving between days**: the week strip at the top of the Habits page is
navigable. Pick a day and the whole page answers to it; arrows move a week at
a time, back through history and up to eight weeks ahead. A past day can be
logged (backdating is safe because the ledger is symmetric — the grant for a
past day is identical to today's and undoing returns exactly that); a day that
has not happened can be read and not written.

**The timer** runs on any habit measured in time (sec/min/hr), as a stopwatch
or a countdown of what is left of the day's goal, in three faces (ring, flip,
plain). It saves progressively rather than at the end, survives leaving and
coming back, and offers ten focus sounds and six end chimes.

**Reminders** — one notification per habit, at a time you choose in its edit
form ("Remind me at"). Standard Web Push, not FCM: a Cloud Function wakes every
five minutes and sends only for a habit that is due today on its own schedule
and has not been logged yet. Turned on once per device from Settings, with a
"send a test" button, because a permission can be granted while the OS still
blocks delivery. On an iPhone the app has to be installed to the home screen
first — the app says so instead of offering a switch that cannot work.

**Seven languages** (English, Arabic, Spanish, French, German, Japanese,
Chinese) with full right-to-left layout for Arabic, switchable from Settings.

**Stats** shows a this-week / this-month activity view, navigable to any past
or future week/month: week is a bar chart (XP per day, Mon–Sun); month is a
day-by-day list where each bar is that day's % of habits touched. The
day-by-day ledger backing it is symmetric too: reverting progress un-bumps
the same day's bucket.

The only audio in the app is the timer's: focus sounds while a session runs and
a chime when it ends, off by default and chosen per person. Nothing else makes
a noise. The recordings are CC0 only, with their sources listed in
[`assets/sounds/CREDITS.md`](assets/sounds/CREDITS.md).

**Cloud sync (optional)** — create an account (email + password, or
**Continue with Google**) from Settings to sync your progress across
devices. Local storage is still the
primary store and the app still works fully offline either way; signing in
just adds a Firebase-backed copy that syncs automatically (a debounced push
after every change, plus a check on each tab/app focus in case another
device changed something since). Sign-up sends a verification email
(non-blocking — you can use sync before verifying), and "Forgot password?"
on the sign-in form sends a reset email. See **Cloud sync setup** below to
turn it on.

**Global ranking** — the **Ranking** page lists everyone by total EXP earned,
flattening rank/level/exp into one comparable number so an F-Rank Lv 1 sits
above a G-Rank Lv 100. It reads a `leaderboard` collection that a Cloud
Function writes from each user's own document; no client can write a score,
including its own. Nothing is stored as a "rank number" — position is a
property of the collection, not of a player, so it is derived from the order
the query comes back in. Equal totals share a position (1, 2, 2, 4).

The ranked number does **not** come from the EXP figure in your browser. Every
EXP movement is appended to a per-user journal that can be added to and never
edited or deleted, and the public standing is that journal's running total.
Rank and level on the board are derived from it too, rather than copied from
whatever the client reported. The journal starts from a baseline taken once,
on first sight of an account — there is nothing to check the history before it
against, so that part is trusted openly rather than pretended otherwise.
Events queue on the device while offline and upload in one batch on reconnect,
so nothing about working without a connection changes. Only
accounts that have **reserved a display name** appear: a public ranking has to
identify people unambiguously, and an unreserved name may be shared with
someone else. The page says so, with a link to where you reserve it.

## Running it

Easiest: double-click `index.html`.

If your browser is picky about opening local files, serve it instead (from this folder):

```bash
python -m http.server 8000
```

then open `http://localhost:8000`.

## Your data

Everything lives in this browser's local storage, tied to how you opened the
app (this exact file, or this exact server address). That means:

- Clearing your browser's site data for this page wipes your progress.
- Opening the app a different way (e.g. `file://` vs a local server, or a
  different port) starts a **separate** save — they don't share data.
- Use **Settings → Export JSON** regularly to back up your progress, and
  **Import JSON** to restore it (or move it to another device/browser).

## Cloud sync setup

Off by default — the account section in Settings just says "not set up" until
you do this once (~5 minutes, free):

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → any name → Analytics is optional → **Create**.
2. **Build → Authentication → Get started** → enable **Email/Password**, then also enable **Google** (pick a support email when it asks — that's just for the OAuth consent screen, not shown anywhere in the app).
   - **Authentication → Settings → Authorized domains** → make sure the domain the app is actually served from is on this list. `localhost` and your project's own `*.firebaseapp.com` domain are there by default, but **GitHub Pages (`osama1716.github.io`) is not** — add it manually or "Continue with Google" will fail with `auth/unauthorized-domain` on the live site (it'll still work fine locally, which is a confusing way to find out this step was skipped).
3. **Build → Firestore Database → Create database** → any region → **production mode**.
4. In Firestore, go to the **Rules** tab, replace the contents with everything
   in [`firestore.rules`](firestore.rules) (copy the whole file), then click
   **Publish**. This isn't just "only you can read your data" — it also
   checks the shape/size of what's being written, so a buggy or tampered
   client can't silently bloat or corrupt your own document. If you ever
   change the app's state shape (new top-level field in `defaultState()` in
   `js/constants.js`), update the matching list in `firestore.rules` too, or
   sync will start silently failing.
5. **Project settings** (gear icon) → scroll to "Your apps" → **`</>`** (web) → register it → copy the `firebaseConfig` object it shows you into `js/firebase-config.js`, replacing the `"PASTE_ME"` placeholders. That config object is meant to be public — it's safe to commit.
6. **Optional but recommended — App Check** (stops random bots/scripts from
   hitting your project using the public config from step 5):
   - **Build → App Check** → **Apps** tab → find this web app → **Register**.
   - Provider: **reCAPTCHA v3** → the console gives you a site key right there → copy it into `js/appcheck-config.js`, replacing `"PASTE_ME"`.
   - Leave enforcement **off/unenforced** at first. Use the app for a bit (sign up, sign in, let sync run), then check the **APIs** tab in App Check — once Firestore and Authentication show verified requests coming through, go to each API's **⋮ menu → Enforce**.
   - Flipping to Enforce *before* confirming real traffic is verified can lock out real users (including you) — same reasoning as double-checking the Firestore Rules got Published, don't skip the "watch it work first" step.

That's it — reload the app and the Account section in Settings will offer sign-up/sign-in.

## Admin backend (Cloud Functions)

One account can be granted real admin powers (look up any user, promote/
demote other admins — mission approval, messaging, and adjustments follow in
later phases) via a Firebase Auth custom claim, enforced server-side, never
trusted from the client. This needs a one-time local setup:

1. `firebase login` (once — opens a browser to sign in with your Google
   account).
2. `cd functions && npm install` — installs the Cloud Functions' own
   dependencies (separate from the zero-build app itself).
3. Deploy: `firebase deploy --only functions,firestore:rules,firestore:indexes`
4. **Bootstrap the very first admin** (no "make me admin" endpoint is ever
   deployed — this is the entire mechanism, done once):
   - Firebase Console → Project settings (gear icon) → **Service accounts**
     → **Generate new private key** → save the downloaded file **outside
     this repo entirely** (e.g. your Desktop) — never inside `the-system-app`.
   - `cd scripts && npm install`
   - `node bootstrap-admin.js "C:\path\to\your-key.json" your-email@example.com`
   - Sign out and back in on that account in the app — custom claims only
     appear in a freshly-issued sign-in token.
5. To promote/demote *other* accounts after that, use the Admin page in the
   app itself (no script needed — it calls the `setAdmin` Cloud Function).

Test locally with the Firebase Emulator Suite (`firebase emulators:start`)
before trusting changes against the real project — it spins up Auth/
Firestore/Functions locally, so mistakes in rules or function logic don't
touch real user data while you're iterating.

## AI task evaluation

Quests and habits are priced by the Claude API rather than by the person
creating them — a self-assigned EXP value can't be compared fairly against
anyone else's, which is what makes a global ranking meaningful. Adding a
task therefore needs an account and a connection; everything else
(completing, logging repeats, stats, editing) still works fully offline.

A habit is evaluated **once, at creation, as a template** — its day-to-day
repeat logging stays local, instant, and free. That's what keeps this
affordable: one API call per task created, not per action taken.

Setup (one time):

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
   → **API keys** → **Create key**.
2. Store it as a secret (never in the repo — this is a public GitHub Pages
   project, and a committed key would be scraped within minutes):
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   ```
   Paste the key when prompted.
3. Deploy: `firebase deploy --only functions:evaluateTask,firestore:rules`

**Appeals** — because the evaluator decides and the user can't, there's a
human review path over it: the flag icon on any task opens an appeal. The
admin sees the task, its current value, and the user's reasoning, then
either upholds the value or sets a corrected one. A correction reprices the
task through the same baseline-delta path an edit uses, so the EXP
difference is exact; for a habit the new value applies to future repeats
only (past repeats were genuinely earned at the old rate).

Tuning lives in [`functions/ai-config.js`](functions/ai-config.js) — the
model, the per-user daily evaluation cap, the input length limits, and the
calibration scale the model prices against. Changing the model is a
one-line edit there plus a redeploy; the calibration anchors to the app's
own seed tasks so values stay consistent across users and over time.

## Reminders setup

Standard Web Push, so there is no console step and no messaging SDK on the
page — just a key pair. The public half is committed (the browser hands it to
the push service when subscribing; it is meant to be public). The private half
signs the sends and must never enter the repo:

```bash
firebase functions:secrets:set VAPID_PRIVATE_KEY
```

Paste the private key when prompted, then deploy:

```bash
firebase deploy --only functions,firestore:rules
```

The first deploy of a scheduled function also enables Cloud Scheduler — answer
yes if the CLI asks. To generate a fresh pair (only if you are starting a new
project), `npx web-push generate-vapid-keys`, put the public half in
`VAPID_PUBLIC_KEY` in `functions/index.js`, and the private half in the secret
above. Changing the pair invalidates every existing subscription, so everyone
has to turn reminders on again.

## Making changes

- `js/i18n.js` — every string in seven languages. One row per key; a key with a missing language falls back to English.
- `js/constants.js` — ranks, colors, seed data, default settings, unit list, and the ready-made habit library.
- `js/engine.js` — all game rules (EXP math, skill-point allocation, task/habit logic, schedules, notes, quit habits, daily stats ledger).
- `js/storage.js` — save/load/export/import.
- `js/sound.js` — the timer's sounds: fifteen synthesised through the Web Audio API, seven loaded from CC0 recordings on demand.
- `js/push.js` — asking for notification permission, subscribing to Web Push, and keeping the subscription where the server can find it.
- `js/cloud.js` — optional Firebase auth + Firestore sync (no-ops if unconfigured).
- `js/firebase-config.js` — your Firebase project's config (see Cloud sync setup).
- `js/appcheck-config.js` — optional App Check site key (see Cloud sync setup).
- `firestore.rules` — the security rules to paste into the Firebase console (kept here so changes are tracked in git instead of only living in the console).
- `functions/` — Cloud Functions (admin claims, unique display names, appeal review, messaging, AI task evaluation, the leaderboard mirror). Deployed separately from the app itself — see "Admin backend" above.
- `functions/ai-config.js` — model, limits, and pricing calibration for the AI evaluator (see "AI task evaluation" above).
- `functions/presets.js` — the ready-made habit library, server side. Editorial fields (title, unit, amount, schedule) live here; the price does not, and is never sent by the client.
- `functions/reminders.js` — the schedule rules again, in the scheduler. Deliberately a second copy: the client cannot be trusted to say a habit is due, and the two are held together by a test that runs every combination through both.
- `assets/sounds/` — the seven recordings, CC0 only, with a source table in `CREDITS.md`. Nothing from another app.
- `scripts/bootstrap-admin.js` — one-time local script to grant the very first admin claim. Never deployed.
- `js/ui.js` — pure render functions (HTML/SVG string builders).
- `js/main.js` — app state, event wiring, glue.
- `styles.css` — the whole visual design.
- `manifest.json`, `sw.js`, `icons/` — PWA installability + offline caching.

No build step — edit and refresh.

## Known open items

- Not synced with the original Notion workspace this was modeled on — this app
  and Notion are two separate sources of truth for now.
- **Groups are cancelled**, not deferred — see the handoff for the reasoning.
  Don't propose them again without the user raising it first.
- A habit's day history is kept for 120 days locally, matching what the Stats
  page reads. Older days are pruned from the device; the EXP they earned stays
  on the server journal, which is what the standing is computed from.
- `EXP divisor` and `skill points per level` used to be tunable in Settings.
  They are gone: two people on different rules cannot share a ranking, so both
  are now fixed and a saved copy carrying either has it dropped on load.
