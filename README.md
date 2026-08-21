# The System

A Solo Leveling–style personal growth tracker: ranks, levels, EXP, an extensible
"Intelligence" stat system, one-off quests, and recurring habits — split across
six sections (Overview, Quests, Habits, Stats, Intelligence, Log) navigable
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
their own **Habits** page — e.g. "Drink 2L water, 7x/week", in whatever unit
fits: count, time, volume, distance, weight, or a custom label). Each logged
repeat awards that quest's EXP immediately and is individually undoable; the
weekly count resets on the ISO week boundary automatically, even if the app
is just left open across midnight. Logging past the weekly target is never
capped or penalized. Habits measured in time (sec/min/hr) get a **live timer**
— start it, do the thing, stop it, and it logs the actual elapsed duration.

**Stats** shows a this-week / this-month activity view, navigable to any past
or future week/month: week is a bar chart (XP per day, Mon–Sun); month is a
day-by-day list where each bar is that day's % of habits touched. The
day-by-day ledger backing it is symmetric too: reverting progress un-bumps
the same day's bucket. No sound effects or music — removed by request.

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

Tuning lives in [`functions/ai-config.js`](functions/ai-config.js) — the
model, the per-user daily evaluation cap, the input length limits, and the
calibration scale the model prices against. Changing the model is a
one-line edit there plus a redeploy; the calibration anchors to the app's
own seed tasks so values stay consistent across users and over time.

## Making changes

- `js/constants.js` — ranks, colors, seed data, default settings, unit list.
- `js/engine.js` — all game rules (EXP math, skill-point allocation, task/habit logic, daily stats ledger).
- `js/storage.js` — save/load/export/import.
- `js/cloud.js` — optional Firebase auth + Firestore sync (no-ops if unconfigured).
- `js/firebase-config.js` — your Firebase project's config (see Cloud sync setup).
- `js/appcheck-config.js` — optional App Check site key (see Cloud sync setup).
- `firestore.rules` — the security rules to paste into the Firebase console (kept here so changes are tracked in git instead of only living in the console).
- `functions/` — Cloud Functions (admin claims, mission approval, messaging, AI task evaluation). Deployed separately from the app itself — see "Admin backend" above.
- `functions/ai-config.js` — model, limits, and pricing calibration for the AI evaluator (see "AI task evaluation" above).
- `scripts/bootstrap-admin.js` — one-time local script to grant the very first admin claim. Never deployed.
- `js/ui.js` — pure render functions (HTML/SVG string builders).
- `js/main.js` — app state, event wiring, glue.
- `styles.css` — the whole visual design.
- `manifest.json`, `sw.js`, `icons/` — PWA installability + offline caching.

No build step — edit and refresh.

## Known open items

- Not synced with the original Notion workspace this was modeled on — this app
  and Notion are two separate sources of truth for now.
- `EXP divisor` (default 1 — Pt is EXP directly) and `skill points per level`
  (default 3) are tunable in Settings if the pacing ever needs adjusting.
