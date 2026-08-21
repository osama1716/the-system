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

**Cloud sync (optional)** — create an account (email + password) from
Settings to sync your progress across devices. Local storage is still the
primary store and the app still works fully offline either way; signing in
just adds a Firebase-backed copy that syncs automatically (a debounced push
after every change, plus a check on each tab/app focus in case another
device changed something since). See **Cloud sync setup** below to turn it on.

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
2. **Build → Authentication → Get started** → enable **Email/Password**.
3. **Build → Firestore Database → Create database** → any region → **production mode**.
4. In Firestore, go to the **Rules** tab and replace the contents with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
   (This is what actually keeps everyone's data private — each account can only read/write its own document.)
5. **Project settings** (gear icon) → scroll to "Your apps" → **`</>`** (web) → register it → copy the `firebaseConfig` object it shows you into `js/firebase-config.js`, replacing the `"PASTE_ME"` placeholders. That config object is meant to be public — it's safe to commit.

That's it — reload the app and the Account section in Settings will offer sign-up/sign-in.

## Making changes

- `js/constants.js` — ranks, colors, seed data, default settings, unit list.
- `js/engine.js` — all game rules (EXP math, skill-point allocation, task/habit logic, daily stats ledger).
- `js/storage.js` — save/load/export/import.
- `js/cloud.js` — optional Firebase auth + Firestore sync (no-ops if unconfigured).
- `js/firebase-config.js` — your Firebase project's config (see Cloud sync setup).
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
