# The System — Handoff (last updated session 9)

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

**Session 9 was the visual pass**, at the user's explicit direction: the
level dial, the rank emblems, the podium monuments, the leaderboard's row
plates, sixteen avatar portraits, eight intelligence emblems, and a surface
grammar in CSS that reaches all 37 flat surfaces without a single new image.
It also ended with a full audit. Read "Session 9" first — it carries the art
pipeline, which repeats, and the two traps in the plate system that each cost
a round trip.

**Session 10 runs in a Claude Code cloud session** (claude.ai/code), not on
the user's machine — see "Session 10" below. Its log is kept there, one entry
per change, so the next session knows exactly what was done.

---

## Session 10 — cloud session, and a running log

**Where it runs.** A Claude Code cloud container with the repo cloned at
`/home/user/the-system`. Everything in "Read this before you try to run
anything" about the Windows paths does not apply here. Node 22 is on PATH and
`node tests/run.js` works as is. The container's network blocks
`osama1716.github.io`, so the live site cannot be loaded from it.

**How work flows.** Work is done on the branch
`claude/free-cloud-session-8kakz6`, committed and pushed. The live app is
GitHub Pages serving `main`, so the user sees a change only once it reaches
`main`. Front-end changes need nothing more; functions and rules still need
`firebase deploy` from the user's machine (see "Deployment workflow").
Changes reach `main` through a pull request from this branch that the user
merges (agreed 2026-09-28). Open or update the PR once a change
passes `node tests/run.js`, and say in it what to check on the live app.

**Who tests what.** The user tests each change on the live app as it
lands, on their own; a later Claude Code session verifies in the browser afterwards. So
every entry below says what to check.

**The rule for this log.** Every change made in this session gets an entry
here in the same commit: what changed, which files, the commit, and what to
check on the live app.

### Log

- **Start (2026-09-28).** Picked up at `22ef27c` (guided walks — the Quests
  walk). All tests pass. No code changed; this section added.
- **Delivery by pull request** agreed and written above. Documentation only;
  nothing to check on the live app.
- **Guided walks on every page** (`js/tour.js`, `js/i18n.js`, `js/ui.js`,
  `styles.css`, `tests/audit/static.js`, `sw.js` → v121). The Quests walk
  was the only one; now all ten pages have one: overview 7 steps, habits 10
  (the last three open the habit form and close it again), planner 6, stats
  6, ranking 7, friends 6, intelligence 5, mail 5, log 3. 55 strings × 7
  languages.
  - Twelve panels gained a class only so a walk can point at them
    (`week-bars`, `overview-radar`, `intel-radar`, `intel-sort`,
    `stats-lifetime`, `races-panel` ×2, `friends-list-panel`, `mail-waiting`,
    `mail-system`, `mail-history`, `log-filters`). They carry no style; the
    static audit now counts a class that `js/tour.js` uses as a selector as
    used, rather than warning that it has no CSS rule.
  - Engine fixes: **Back** onto a step with nothing to point at used to
    bounce forward again — skipping now follows the direction of travel.
    A target **taller than the screen** had the bubble clamped over its own
    heading (the month name and arrows on Stats); it is now scrolled in by
    its top and the bubble sits over its bottom with no arrow. The arrow
    also fades with the bubble between steps.
  - New step option `end`: ranking, friends and mail need an account, so
    signed out their walk is two steps — the page, then "sign in first",
    which ends it ("2 of 2"). Signed in, that step is not shown and not
    counted, so the count reads 1 of 6, 2 of 6… with no gap.
  - The habits "which day" step says how many past days can be logged from
    `SYS.HABIT_BACKFILL_DAYS` (passed as `{n}`), so it cannot drift from the
    rule.
  - Verified in Chromium at 390px and 1280px: every walk runs start to end
    with no errors; the signed-in pages were checked by rendering them with
    made-up data; Back, Escape (closes the form the walk opened) and Arabic
    right-to-left all checked. The log walk's last step is skipped when the
    log is empty, by design.
  - **To check on the live app:** press "?" on each page → "Walk me through
    it". Worth a look signed in on ranking, friends and mail, which could
    only be checked here with made-up data.
  - Merged as osama1716/the-system#1 (2026-09-28). **The user has not
    walked them one by one** — they left that to a later Claude Code
    session. So: go through all ten walks in the browser, in English and
    Arabic, on phone and desktop widths, and signed in where you can.
- **The faint text reaches 4.5:1** (`js/constants.js`, `styles.css`,
  `sw.js` → v122). The user chose this (it was left open at the end of
  session 9). `--faint` is the small text: day names, eyebrows, empty notes,
  field labels. It was 2.96:1 on dark themes and 2.44:1 on light ones.
  - Dark themes: faint .36 → **.49**, dim .5 → **.55**, body unchanged at
    .6. Light themes: faint .4 → **.63**, dim .55 → **.69**, body .66 →
    **.75**. Dim and body moved only to keep faint < dim < body; on the
    light themes faint alone would have come out darker than dim, and dim
    was itself only 3.7:1 there.
  - Measured on every surface text sits on (gradient stops, card over them,
    plate, sheet): every theme's faint is now 4.50–4.72:1, dim 5.3–5.7:1,
    body 6.1–6.9:1. The CSS fallbacks in `:root` match.
  - (Historical — the custom theme was removed on 2026-09-30.) Custom
    themes could not be checked in advance, so `buildCustomTheme` solved
    for them: the lowest opacity from the fixed themes' value up
    that reaches 4.6:1 on all the same surfaces, then dim and body at the
    fixed spacing. A mid-tone background (grey, mid blue) cannot reach 4.5
    with any grey, so the search stops at 0.8 rather than pushing all three
    to full ink and losing the difference between them. Checked on 38
    backgrounds: the order held on every one.
  - **To check on the live app:** small text on any page, in a dark and a
    light theme. The look should be the same, just easier to read.
- **"?" beside the ideas themselves** (`js/ui.js`, `styles.css`). Until
  now the six concept topics were only in the help index. The user chose
  to put them in the pages too, sparingly: one place each.
  - level: beside "LEVEL" in the overview dial. rank: beside the rank
    emblem on the overview. exp: beside "LAST 7 DAYS" on the overview.
    streak: beside "Best streak" / "Current streak" on Stats. traits: beside
    "CATEGORIES & TRAITS" on Intelligence. verification: on the "reward
    held" line under a quest.
  - `helpMark(topic, true)` gives the small size (`.help-mark-sm`, 16px).
    In the dial and beside the emblem it takes a negative end margin as
    wide as itself, so the centred text and emblem do not move.
  - Verified in the browser: each of the first five opens its own topic, no
    errors. **The verification mark was not seen on screen.** It only
    appears when a reward is being held, and there was none in local data.
  - **To check on the live app:** the marks above, and the verification
    mark the next time a reward is held.
  - Merged as osama1716/the-system#2. The user liked it and said **the
    marks' places may be adjusted later** — they are a first placement,
    not settled. Move one when the user names it; do not reshuffle them
    unprompted.
- **Leaderboard follow-ons put in the plan** (see PLANNED NEXT, section 2),
  in a recommended order. Documentation only.
- **The status bar, redesigned at the user's request** (`js/ui.js`,
  `js/main.js`, `styles.css`, `sw.js` → v123).
  - The rank is its **emblem** (`rankArt`, 26px) beside the name, not the
    gold "G-RANK" pill. Its name is the tooltip and the aria-label. The
    `.rank-badge` rule is gone; nothing used it any more.
  - The **level moved right**, before the EXP bar: `LV. 13 ━━━ 10/100`.
  - **Friends and mail moved out of the navigation into the status bar**,
    top right, as picture icons with a red count (`.status-count`). The
    user asked for a move, not a copy: the phone's bottom bar went from
    eleven buttons to nine. The icon of the page you are on is lit.
    `NAV_ITEMS` no longer lists them; `STATUS_ITEMS` does.
  - `renderStatusSocial(ui)` draws just the two icons. `renderSidebarInto`
    swaps that part in whenever it redraws the sidebar, so the counts and
    the lit icon follow every navigation and every count change, without
    redrawing the whole bar (which would interrupt a rename in progress).
  - Verified at 390px and 1280px, dark and light, English and Arabic: no
    horizontal scroll, the bar stays one row on a phone, each icon opens
    its page and lights up, the counts render (checked with made-up counts),
    all ten walks still run, no errors.
  - **To check on the live app:** the bar on a phone and a computer; a
    friend request or a System message should show its count on the icon.

- **The ten walks, checked (2026-10-02)** (`js/tour.js`). Walked all ten in
  English and Arabic at 390x844 and 1280x800, on a fresh account and on one
  with quests, habits and a log, measuring each step: bubble on screen, target
  on screen, bubble not covering a target, no horizontal scroll, text not a
  raw key, no errors, form closed afterwards. Two bugs found and fixed:
  - **The form steps never showed.** `startTour` drops steps whose target is
    absent before the walk begins, and the form is closed then, so every field
    after the first was dropped: quests walked 4 of 9 steps, habits 4 of 10. A
    step whose `act` is clickable now opens something, and the steps after it
    are kept until an `act` that is not clickable (the closer).
  - **The count.** Signed out, ranking/friends/mail read "1 of 1" then "2 of
    2". An end step left after the filter will be shown, so the total is its
    position.
  - Now: full walks everywhere with data; on a fresh account quests 7, habits
    6, stats says there is nothing yet. Signed-in ranking/friends/mail were
    not re-walked (no sign-in from here).

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
- **Stats** (rebuilt after the audit) is one page in two shapes, switched by a
  row of habit chips: All, or one habit. Both open on a month calendar whose
  day rings show how much of what that day asked for was done; tapping a day
  opens its log (habit, amount, time logged, note). All adds the month's rate
  and four all-time figures (perfect days, best streak, habits done, habits a
  day), today's list, and EXP by month from the journal. One habit adds the
  year grid, eight figures, the **Comparison** chart, notes, and Edit /
  Archive / Delete. Engine: `dayRing`, `habitDayRing`, `monthGrid`,
  `yearMarks`, `statsAllTime`, `monthRate`, `habitStats`, `dayLog`,
  `comparison`, `monthVolume`.
  - **The long memory — read before touching Stats.** `task.days` keeps 120
    days of detail. Beside it, `task.marks[year]` is one character per day:
    `.` nothing asked, `-` asked and untouched, `0`–`9` that tenth done, `+`
    done. `sealMarks` writes every past day once, up to yesterday
    (`task.sealedTo`), and **never re-judges** a sealed day — changing a
    schedule must not rewrite history. It runs in `normalizeState` and **must
    set `rep.migrated`** when it writes, or the seal is recomputed on every
    load and never saved. Two years are kept (`pruneMarks`).
  - **Why marks can't be derived from `task.days`:** a required day that was
    simply skipped has no entry at all; only the schedule knows it was owed.
  - **Precision:** while a day is still in `task.days` its fraction is exact
    (`exactFraction` / `dayFraction`); after pruning it is the mark's tenth,
    rounded down. 1.1 L of 2 must read 55% on the calendar, the same as the
    habit card — that bug shipped once.
  - **The quota rule (the user's call):** a "N times a week" habit asks nothing
    of any particular day — `.` when not done, `+` when done, and partial
    progress on it is invisible. It can lift a day and never spoil one. Fuzzed
    as a property in `test-stats.js`.
  - **Archiving:** `task.archived` + `task.archivedAt` (a day). Not asked for
    from that day on, everything before still counts, hidden from the Habits
    page, a faint chip at the end of the Stats row. `functions/reminders.js`
    skips archived habits too — the server is what sends.
  - **Log times:** `day.at` is minutes since local midnight, stamped on every
    write that adds progress. It means *when it was logged* — the user chose
    that explicitly, backdating included. Days from before it existed have none
    and show a dash; never invent one.
  - **Comparison:** one habit at a time, because units can't be added across
    habits. Week / month / year of amounts against the previous period; a
    bucket that hasn't happened is `null`, never zero. The month view has as
    many buckets as this month has days (30, or 29 in a leap February — the
    user asked for exactly that), while last month's legend total is still its
    whole month, including a 31st this month's axis has no room for. Every day
    and every month is labelled. The year view reads `task.volByMonth`, filled by the same prune
    hook as `volPruned` and kept for two years (`pruneVolByMonth`). Colours are
    an emphasis pair — the accent for this period, `--bar-prev` for the
    previous one — and `barPrev` is a per-theme token whose seven values were
    each validated with the dataviz validator (≥ 3:1 on the card, OKLab ΔE ≥ 15
    from the accent; no single opacity passes all seven). The custom theme
    computes its own in `pickBarPrev`. One hover/focus readout per bucket plus a
    table view, so nothing is readable only by hovering.
  - **Short time units are translated** (`vol.h` / `vol.m` / `vol.s`), and a
    zero reads in the habit's own unit — "0 min", not "0s".
  - The habit card's icon is a ring of today's amount against the goal.
- The old Stats week/month bars and lifetime tab are gone; the lifetime EXP
  list lives at the foot of the All view.
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
  one-minute scheduler with a catch-up window and per-device dedupe, and one
  notification per device listing what is due.

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
- Tuning lives in `functions/ai-config.js`: model, per-user daily cap (20),
  input length caps, and the calibration scale. **Changing the model is a
  one-line edit there.** Currently `claude-sonnet-5` at effort `low`.
- **The prompt** is `functions/evaluation-prompt.js`: the calibration, the
  rules, **the user's routing decisions** (casual running is Daily exercise,
  race training is Sports; meditation and journaling are Reflection &
  thinking; cooking, typing and other fine-motor skills are Handcrafts, with
  Writing added when the skill is writing; coding puzzles are Programming;
  errands and chores get no category; a one-off challenge kept up for a set
  period adds Self-motivation, a repeating habit does not; a quest describing
  an endless routine is priced as one occurrence on the habit scale), and
  **14 worked examples** from `functions/evaluation-examples.js`. Examples are
  few on purpose — each exists for a failure the eval found or a decision the
  user made; a long list teaches copying the nearest number.
  `buildEvaluationRequest` builds the request for both the function and the
  eval, with the system prompt **cached** (5-minute ephemeral).
- **Cost:** ~4.5K input tokens now. A cached call (another evaluation within
  five minutes) is about $0.0028; a cold one about $0.012, since a cache write
  is 1.25× input. Before examples and caching, every call was about $0.006.
- **The eval** (`evals/run.js`, `evals/cases.json`, 96 cases) calls the real
  API with the real request and grades price band, category, trait and
  two-wordings consistency. Cases can say `anyCategory` / `traitAny` where
  more than one answer is defensible, or `categories: null` to grade only the
  price. It refuses to run if a case title repeats a prompt example.
  `--only a,b --reps 3` re-runs a few cases to tell noise from a pattern — use
  it before "fixing" a single miss. Key in `evals/.apikey` (git-ignored);
  results in `evals/results/<label>/` (git-ignored). Session 8's climb:
  category 93→100%, trait 87→100%, price 99%, consistency 100%, for about
  $1.40 of runs. **Every run spends real money — get the user's OK.**
- **Appeals feed the eval.** The admin panel's "Export for AI evals" calls
  `exportAppealsForEval`, which writes every appeal, anonymised (task, the
  evaluator's price, the argument, the decision), to that function's log as
  `[appeals-export]` lines, read with `firebase functions:log --json`. They
  are the evaluator's recorded mistakes — the best material for new cases.

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
- **The custom theme is gone** (2026-09-30, at his word: *"شيل الcustom من
  الثيمات"*). It let the user pick dark/light + accent + background and
  derived the other ~35 values. `buildCustomTheme`, `setCustomTheme`,
  `CUSTOM_THEME_NAME` and the two colour inputs are deleted, along with the
  `rgba`/`shade` helpers that existed only to feed it. `contrastRatio` and
  `luminance` stay: they are how a palette gets checked rather than
  eyeballed. A saved copy still on "Custom" is migrated to the default in
  `normalizeState`, which is also where an out-of-kind clock slot is fixed.
- **The default is now "White & dark brown"**, a light theme. Anyone with a
  theme already saved keeps it; this only decides where a new account opens.
- **The clock option** (`settings.themeAuto`), named **Automatic** in the UI
  because that is the word people already know from their phone: off,
  `settings.theme` is what shows. On, the app wears `themeDay` while it is
  light out and `themeNight` after that, defaulting to White & dark brown and
  Black & dark gold. Every reader goes through `SYS.resolvedThemeName(state)`,
  never `settings.theme`.
  - **It ships on**, for a new account only. Spreading that default over a
    saved copy would have switched it on for everyone who had already picked
    a theme by hand — a black one turning white at breakfast, uninvited. A
    copy saved before the option existed carries no `themeAuto` at all, and
    that absence is the tell `normalizeState` checks.
  - **The trap that cost a round here:** in `normalizeState`, `out` **is** `s`
    — `const out = s || SYS.defaultState()`. So `out.settings = { ...defaults,
    ...out.settings }` replaces `s.settings` in place, and a guard reading
    `s.settings.themeAuto` after that line reads the default it was meant to
    detect. Anything judged on what the saved copy carried must be captured
    above the merge, the way `savedPlayer` already was.
  - The boundary is an hour, not sunrise maths — `SYS.THEME_DAY_START` 7 and
    `SYS.THEME_NIGHT_START` 19. The app knows the time and nothing about
    where you are, and an hour printed in the settings hint is one the user
    can predict.
  - Two selects instead of one when it is on, each holding only its own kind
    of theme. One list would have accepted a black palette for the daytime
    slot and then appeared to do nothing until nightfall.
  - Turning it on or off never changes what is on screen in that moment: on,
    the chosen theme is adopted into its own slot; off, what the clock last
    resolved becomes the chosen one. The switch is invisible; the next
    boundary is where it shows.
  - `applyThemeIfClockMoved` in `main.js` runs on a minute interval and on
    `visibilitychange`, and touches the document only when the resolved name
    changed — a phone that slept through 19:00 catches up when it wakes.
- **The first paint** no longer flashes the wrong palette. `applyTheme`
  writes the resolved theme to `localStorage` under `SYS.BOOT_THEME_KEY`, and
  a small inline script at the top of `index.html` puts all 38 values on
  `:root` while the HTML is still being parsed. `:root` in `styles.css` is
  still the fallback for a first-ever visit. The camelCase → `--kebab-case`
  rule is duplicated there on purpose — it is the only copy outside
  `cssVarName`, and a second request before the first pixel would cost more
  than it saves.

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
- `reminderSent/{uid}__{subscriptionId}` — `{ day, ids }`, the reminders a
  device already had on its local day. Each id is `sentKey(task, at)` —
  `habitId@HH:MM`, one per time — so every time of a habit reminds once a
  day, and moving one later the same day reminds again. Server-only, no match
  block.
- `adminDirectory/{uid}` — `{ since }`, one row per admin: who admin
  notifications go to. Auth can't be queried by claim, so `setAdmin` and
  `scripts/bootstrap-admin.js` keep this list; if it is ever empty,
  `adminUids()` rebuilds it from Auth once. Server-only, no match block.
- `users/{uid}/inbox/{msgId}` — owner read; owner may update **only** `read`.
- `userDirectory/{uid}` — `{email, name, usernameKey}`, admin-read-only.
- `usernames/{normalisedName}` — signed-in read (availability preview),
  **no client write at all**.
- `appeals/{id}` — create own with forced `status:'pending'`; read own or
  admin; **update flatly false** (all transitions go through functions).
- `aiUsage/{uid}` — server-only both ways.
- `progressLedger/{uid}/prices/{priceId}` — what `recordProgress` has paid
  for each priced task. Server-only, no match block.
- `leaderboard/{uid}` — `{displayName, rank, level, exp, totalExp,
  questsCompleted, updatedAt}`. Signed-in read, **no client write at all**.
  Indexed automatically (single field `totalExp`), so no
  `firestore.indexes.json` entry was needed.

**Firestore gotcha:** rules can't filter a list query, only allow/reject it
whole. A user's own "my X" query **must** include `.where('userId','==',
myUid)` or it's rejected outright.

### Cloud Functions (`functions/index.js`, 33, 2nd gen except onUserCreate)
26 callables: `recordProgress`, `unlockTimes`, `submitReflection`, `reviewReflection`, `reflectionStatus`, `reviewSuspicion`, `claimUsername`, `checkUsername`, `backfillUsernames`,
`lookupUser`, `resolveUsers`, `backfillLeaderboard`, `backfillExpBaselines`,
`setAdmin`, `getAdminStatus`, `backfillUserDirectory`, `resolveAppeal`,
`rejectAppeal`, `exportAppealsForEval`, `applyAdjustment`, `suggestQuests`,
`evaluateTask`, `priceLibraryHabit`, `sendTestPush`, `reportSaveFailure`,
`pushConfig`.

Plus four triggers — `onUserCreate` (Auth), `recordExpEvent`,
`mirrorLeaderboard` and `notifyAdminsOfAppeal` (Firestore) — and one
schedule, `sendReminders`, every
minute, looking back over a ten-minute catch-up window and deduplicated per
device in `reminderSent`. Every decision near a reminder time is logged with
its reason, and every five minutes it logs one summary line per device — zone,
local time, and the reminder times on the account's copy (times only). The
app re-saves its push subscription on every signed-in start, because the
server's copy can be deleted while the browser still says reminders are on.

**A habit has several reminder times and an optional message:**
`task.reminders` is a sorted, deduplicated list of `"HH:MM"` (at most
`SYS.MAX_REMINDERS`, 8) and `task.remindNote` the notification's line (≤100
chars, one line). The single `task.remindAt` of the version before is read by
both sides (`SYS.reminderTimes` / `reminderTimes` in `functions/reminders.js`)
and moved into the list by `migrateReminders` on load.
`tests/test-reminder-list.js` holds the client and server to the same times.
Several of one habit's times inside one window make one notification; a
single habit's notification says its message, several habits list titles.
Custom ringtones are **not possible** for web push on any platform — the
notification sound belongs to the OS and the browser.

**Saves are never lost in their 900 ms wait any more.** `cloud.js` flushes a
waiting save when the page is hidden or unloads (`flushPush`), and remembers
per account, in localStorage, that the device holds a change the account has
not got (`unsavedSince`) until the newest write lands. On launch, when the
two copies differ, both agree with the journal, and this device's unsaved
change is newer than the stored copy's `updatedAt`, `resolveOrAsk` pushes the
device's copy instead of asking "which copy to keep" — that prompt had been
offering a way to lose an edit made just before a reload.
`tests/test-save-queue.js` drives the queue against a stand-in Firebase.

`reportSaveFailure` is how a refused cloud save reaches the logs: the write
goes browser → Firestore, so a refusal otherwise leaves nothing server-side.
On the first failure of a session `cloud.js` sends the error code and message
and the size of each part of the state — sizes and counts, never content.

**Reading these logs:** `firebase functions:log --only <name> --json` and
filter for `logName` ending `stdout`/`stderr`. The plain text output shows
mostly Cloud Run request lines (one empty line per scheduler run), which makes
it look as if the function prints nothing. It does.

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

## Session 9 changelog — the visual pass, and an audit

Session 9 was almost entirely **look**, at the user's explicit direction: he
said finish the whole visual pass first, page by page, at whatever pace it
takes ("الشكل كثير مهم"), and only then go to Google Play. He had heard the
argument that the launch list matters more and decided otherwise. Do not
reopen it.

### How art gets made now — the pipeline, because it repeats

The user generates every image in **ChatGPT** (he has no interest in me
trying; I cannot generate images). The loop is:

1. I write a long, structured prompt. He pastes it, attaches a style
   reference, and sends me back the render.
2. **Everything is generated on flat magenta `#FF00FF`.** Nothing in the
   app's palette is magenta, so the background can be keyed out by colour
   rather than by reachability — which matters because enclosed holes (the
   ring in a podium monument) are unreachable by a flood fill.
3. I key it, measure it in PowerShell + System.Drawing (WPF's
   `BitmapDecoder` reads the WebP he sends), slice it, export it, and wire it
   in. Scripts for all of this are gone with the scratchpad, but every
   technique is described below.

**Style reference to attach:** `assets/podium/first.png` (the newest, richest
piece — it defines the current look) plus `design/mark-source-dark-body.png`
(the original logo). Say explicitly in the prompt that they are **material
references, not subject references** — otherwise the model puts rings,
arches and plinths into everything.

**What the prompts must always say**, learned the hard way:
- Never the words "AAA mobile game" — that phrase alone produces mobile-gacha
  art, and the user's word for the first batch of rank emblems was "طفولية".
  Ask for a studio photograph of a forged object instead.
- 70% of the image dark; gold is trim at under 15% of the surface; empty
  space is required; one muted accent colour, never a pure hue.
- No glow, no neon, no rim light on every edge.
- Nothing spilling into the magenta — no glow, no haze, no cast shadow.
- For a nine-slice bar: **the middle must be identical at every point from
  left to right.** This is the constraint the model breaks most often.
- Judge one before commissioning twelve. Twice in this session a set of
  twelve came back wrong in the same way, at twelve times the cost.

### What was built

**Level dial** (`assets/frames/dial-ring-512{,-light}.png`) — the outer rim
is artwork; progress is a `conic-gradient` masking it. Two long detours died
first: a WebGL fire ring (deleted, recoverable from commits 580bbb0 and
ca59ba5) and three CSS directions he rejected. What he wanted, and what
shipped, is that **the ornament itself is the progress bar**.

**Rank emblems** (`assets/ranks/{G,F,E,D,C,B,A,S}-{128,512}.png`) — the rank
letter drawn as an emblem, escalating in prestige. `SYS.RANK_ART` lists which
ranks have art; an unlisted rank falls back to its letter. Animating their
flames was attempted and abandoned: the flames sit in pockets closed by the
wings, and they are streaky strands rather than flat washes, so they cannot
be separated from the engraved traces in this artwork. Do not try again
without new art that has the fire on its own layer.

**Podium monuments** (`assets/podium/{first,second,third}.png`) — the top
three each stand in an arch with a circular opening their avatar sits in.
`PODIUM_ART` in ui.js carries `fy`/`fd` per monument: where the opening's
centre falls as a share of the drawing's height, and how wide it is as a
share of the width. Those were measured off the art by scanning for the
widest transparent run the vertical centre line passes through, restricted to
the upper 62% so the soft bottom edge of the plinth is not mistaken for a
hole.

**Leaderboard row plates** (`assets/podium/row{,-you,-top}.png`) — three
nine-slice bars: plain, yours, and the winged one the first three earn. Read
the comment block above `.lb-row.lb-plate` in styles.css; it carries the
measured ratios and why they are ratios. Two things there cost real time:

- A nine-slice stretches **one column** of the source across the row, so the
  middle has to be identical along its length. The painted rails never are.
  Every plate's middle is therefore **rebuilt** before export: one averaged
  column repeated, with the ornamental ends cross-faded into it over a ~150px
  ramp so the join cannot be found.
- Finding where the dark panel starts changed method when the panel turned
  gold. It used to be the darkest thing in the plate. Once it was the same
  metal as the frame, a colour-departure test returned a panel 11% tall,
  because the panel's own reflected band reads as a departure. The boundary
  is not a change of colour but **a change of surface**: the frame steps down
  over a bevel, and a bevel is a sharp edge. Found by gradient, the smooth
  band scores low and the milled step scores high.

**Sixteen avatar portraits** (`assets/avatars/a01..a16{,-64}.jpg`) — painted
manhwa busts, thirteen in a serious register and three softer, at his
request. They are **square JPEGs on an opaque ground**, not PNGs with alpha:
the circle is cut in CSS, which costs nothing and makes a painted face about
a fifth of the weight. All 32 files are 180KB. The frame is cropped to 70% of
the source, centred on the head, because at 22px a full bust is a smudge.

There is **no blank avatar**. `SYS.defaultAvatarFor(uid)` hashes the uid onto
one of the sixteen, so every player has a face from the first moment. The ids
kept their old `a01..a24` numbering on purpose, so anyone who had picked one
while they were emoji still holds an id the server knows. **The avatar list
lives in three files** — `js/constants.js`, `functions/profile.js` and
`tests/test-profile.js` asserts they are identical.

**Eight intelligence emblems** (`assets/intel/<key>{,-48}.png`) — an eye, a
book, a set square, a running figure, a tuning fork, a compass rose, a leaf,
two people. They replace the four-letter codes on the category cards, the
radar's eight axes (as an SVG `<image>`), the type chips in both forms, and
the marks on a task row. `SYS.INT_ART` lists which keys have art; a category
the user adds themselves keeps its short code. Nothing in `intArt` may depend
on colour or name, because the radar in a public profile carries only a key
and a short code. Each emblem is scaled by its **longest side** and centred
in a square — scaling by height left a triangle and a star bobbing at
different heights in the same grid.

### The surface grammar — 37 flat surfaces, no new images

The ornate pieces were photographed metal and everything else was a
translucent rectangle with a round corner. Rather than commission a frame
image per surface (37 of them, about 7MB, and a slightly different gold in
every render), the drawings' grammar is stated in CSS. See the comment above
`.sys-panel` in styles.css. Two mechanisms, because one cannot cover
everything:

- **The plate.** `::before` is the edge, a vertical gradient so the top rail
  catches light. `::after` is the fill, inset by the edge's width — which is
  what leaves a rim along the 45-degree cut that a border can never follow,
  since a border follows the rectangle and the cut does not.
  `isolation: isolate` keeps both under the content at `z-index: -1` without
  touching a single child.
- **The shape only.** Form controls render **no pseudo-elements at all**, and
  inside a scroller an absolutely positioned pseudo scrolls away with the
  content. Inputs, selects, textareas and `.modal-box` take the cut shape and
  an inset pair of hairlines instead.

Geometry is preserved everywhere by setting border-**color** to transparent
rather than removing the border, so every box keeps its pixel and nothing
moves.

**Two traps in that system, both of which cost a round trip:**

1. **An element's own background is not clipped.** The cut lives on the two
   pseudo-layers; the element's own background paints underneath them and
   nothing clips it. `.filter-chip.active` and two schedule keys set
   `background: var(--gold)` directly at a higher specificity than the plate
   rule that clears it, so a gold **rectangle** came out from under a cut
   shape. They hand the colour to `--plate-on` now. If a selected state ever
   looks rectangular again, this is why.
2. **An `outline` is always a rectangle.** The focus ring boxed the shape
   instead of tracing it. The plate's own rim is the focus ring now: it
   brightens *and* thickens, so the cue is not colour alone. Surfaces with no
   rim take an inset ring. A sweep of all ten pages found zero focusable
   elements with a cut shape and no override.

I misread "the shape is still a rectangle" twice as a complaint about the
focus outline and once changed the cut from two corners to four. **It is two
corners — top-left and bottom-right — and he wants it that way.**

### Decisions settled in session 9

- **Art for what you earn; CSS for what you use.** Images are reserved for
  ranks, levels, the podium and row plates. Everything operational is styled
  in CSS. If everything glitters, the glitter stops meaning anything.
- **One title per page**, and it is the page's own name from the sidebar
  (`nav.<page>`). Every page used to carry an eyebrow above a longer phrase —
  "GLOBAL RANKING" over "Leaderboard" — which read as two titles saying the
  same thing. The board's list took the name the page used to carry. Stats
  draws its own head because when one habit is in view the title is that
  habit's name.
- **No prose explaining the app.** 23 strings came out of all seven
  languages. A help system with a "?" beside anything that needs one is
  coming; until then, do not write captions.
- **Capacitor with `server.url`** pointing at the live GitHub Pages site —
  see [[the-system-play-store-plan]]. `git push` stays the whole deployment
  for any web change even after the app is on Play.
- **Photo → portrait avatar** ("make my own face") is wanted, is the best
  idea he had this session, and belongs **behind the subscription**: it is
  the first feature with a per-user marginal cost, and it needs consent copy,
  moderation, storage rules and a Data Safety disclosure. Revisit after the
  Play steps.
- Rejected and closed: full-body characters with a creator (he cancelled it
  himself), and animated fire on the rank emblems.

### The audit at the end of session 9

He asked for a full sweep. What it checked and found:

**Clean:** all 30 test files pass; 113 precache entries and none missing; 943
strings × 7 languages with **zero gaps and zero placeholder mismatches**; 396
requests across a full walk with zero failures; zero console errors walking
all ten pages twice; no horizontal page scroll on any page at 375px.

**Four fixed:**
- `.task-title` could not shrink — the reward and the action buttons are both
  `flex-shrink: 0` and a flex item's default `min-width` is its content — so
  the task row overflowed its card by about 20px on a phone and pushed the
  edit and delete buttons past the edge.
- `.range-slider` had the same shape of bug: `flex: 1` sets the basis to zero
  but `min-width` stays `auto`, and a form control's auto minimum is its own
  intrinsic width (~129px). The stepper row overflowed by 24px.
- `var(--bg)` was used on the sticky first scope chip and **is not defined
  anywhere** — a leftover from an older palette. An undefined custom property
  resolves to nothing, so the one chip meant to stay put while the others
  scroll under it had no background and they showed through. It takes
  `--plate-card` now.
- `.intel-pole-name` painted the category colour as text. Those colours were
  chosen against black; the warmest came out at 2.0:1 on a daylight theme. It
  arrives as `--cat` now and light themes mix it down toward black.

**One reported, deliberately not changed:** `--faint` is **2.96:1** on the
dark themes and **2.44:1** on the light ones, against a 4.5:1 floor for the
small text it is used on — day names, eyebrows, empty notes, field labels. It
is a deliberate palette token in all seven themes, and changing it changes
the look of every page, so it is his call. Raising its alpha from .36 to
about .55 reaches 4.5:1.

**Noted, not touched:** about 1.65MB of profile-frame art in
`assets/frames/profile-circuit-*` that nothing references or precaches. It is
held on purpose for a future profile frame.

### Where the visual pass stands

Done: the level dial, rank emblems, podium monuments, row plates, avatars,
intelligence emblems (now in both a dark-theme and a light-theme set), the
application-wide surface grammar, page titles, the prose removal, and the help
system with its guided tours.

### UPDATE 2026-10-02: the light icons are the dark originals in the LOGO's gold

**Supersedes the two sections below.** He did not like the ChatGPT redraws and
pointed at the brand mark on the light theme as the thing that works. Measured:
the mark's gold on light is a dark antique bronze (#423823 / #705725 / #95763b),
14% of the mark, on 79% black. The redraws' gold was bright yellow (#d9901c,
highlights #ffde59) at ~40%. A dark gold is strong on white; a bright one
dissolves into it. So the fix was the tone, not the shape.

All twelve `*-96-light.png` are now the **dark-set originals recoloured**, no
new art: low-saturation (ivory) pixels -> the mark's black (#1c1a17..#050505),
gold pixels -> the mark's gold ramp by their own lightness, so shading survives.
Edge share below 3:1 at 26px: 0% on all twelve (ChatGPT set 0-21%). If he finds
it dull, brighten the ramp's top a step and re-measure.

**Second step, same day: two golds.** He said they were the same design but
still not clear. The mark's mid gold is 6.2:1 on the white page but only 2.7:1
on the black body, so the interior lines sank. No single gold is strong on both
(#95763b is ~4:1 each way). Now gold within ~5px (of 96) of the silhouette uses
the mark's ramp; gold deeper inside uses a brighter one (#7a5c22 / #b08a3a /
#d4b060, ~6:1 on the body), cross-faded with a blurred eroded-alpha mask. Edge
share stays 0-2%. Live as of commit after ed67749.

**Settled:** two icon sets, one per theme. He asked whether one look could serve
both; the only way that works is the ivory set on small dark tiles on the light
theme, and he declined it. Do not re-propose. The ChatGPT renders
stay in git history (commits 9305375, d872a49, bd8ede6).

### UPDATE 2026-10-01: the light icons' real fault is the OUTER EDGE

**This supersedes the section below.** He said the light set is still
unclear, the dark set is fine, and that "gold rim only, rest black" (the
corrected five) changed nothing. Measured at the real 26px against the light
card, the share of each icon's **edge** pixels below 3:1: light set 36–86%
(friends worst), dark set 0–33%. Gold is a mid-tone — strong on black, weak
on near-white — so on the light page the outline that draws the silhouette
dissolves. "Gold rim only" put the gold on exactly that edge, which is why it
did nothing. Interior gold is a secondary issue.

Darkening the outermost 3px of the existing files (eroding the alpha, not
growing it — growing fills the gaps in friends and the wreath) visibly
helped. He chose instead to **redraw all twelve** with a black outer edge and
the gold inset inside it. Judge **friends** first, then the rest. He attaches
the dark-set render of the same icon so the shape comes from the image, not
from words. The prompt:

```
Attached is an icon. Redraw the SAME icon — identical object, pose,
composition, proportions and silhouette. Change only its materials.

Background: perfectly flat solid magenta #FF00FF, edge to edge. Nothing
spills onto it: no glow, no haze, no shadow, no reflection, no gradient.
The icon is centred and fills about 88% of the square canvas.

It will be shown on a near-white page at 26 pixels, so:
- The OUTERMOST edge of the whole silhouette is a continuous, thick,
  near-black outline (#0a0908), about 4% of the icon's width, unbroken all
  the way round. No gold ever touches the outside edge.
- Just inside that black outline runs a thin polished gold rim
  (#c8912f to #e8c070).
- All faces are matte black (#121110 to #050505).
- Interior detail: few lines, thick, simple. Keep only the lines that make
  the object recognisable; drop decorative circuit traces and small grooves.
  Gold covers no more than a quarter of the icon.
- Separate parts (people, leaves, wreath branches) keep clear magenta gaps
  between them, wide enough to survive at 26 pixels.
- No glow, no neon, no rim light, no bloom, no texture noise.
Studio photograph of a forged metal object, not a cartoon, not a mobile game.
```

When a render arrives: key the magenta, trim to content, fit into a 96px
square with 3% padding, save over `assets/icons/<page>-96-light.png`, then
re-measure the edge share before showing him.

**Progress (2026-10-02).** Friends is done and live (edge 86% -> 8%). Intelligence too (59% -> 11%), from the one-step prompt below; it kept more circuit traces than asked and he accepted it that way. The other ten followed in one batch the same day and **all twelve are live**. Edge share below 3:1 at 26px, before -> after: overview 64->1, quests 36->0, habits 53->21, planner 57->4, stats 40->9, leaderboard 55->6, log 39->11, mail 63->10, settings 44->12, admin 58->8. ChatGPT kept more circuit traces than the prompt asked on most of them. Habits is the weakest at 21%. The five corrected on 2026-09-30 were replaced too, so the set shares one edge; if he prefers an older one, git history has it. His
note on the first render: flat black heads looked too unlike the dark set,
so the accepted version keeps ONE bold gold line per head from the
original. The other eleven originals were exported to
`Downloads/icons-originals/<page>.png` (from images 19-35 of session
374ab821; some have black or checkerboard grounds, the prompt says to ignore
them). The one-step prompt that replaces the two-step one above:

```
Attached is an icon. Redraw the SAME icon — identical object, pose,
composition, proportions and silhouette. Ignore the attached image's
background.

Materials, for a near-white page at 26 pixels:
- The OUTERMOST edge of the whole silhouette is a continuous, thick,
  near-black outline (#0a0908), about 4% of the icon's width, unbroken all
  the way round. No gold ever touches the outside edge.
- Just inside that black outline runs a polished gold rim
  (#c8912f to #e8c070).
- Every face that is ivory/white in the attached image becomes matte black
  (#121110 to #050505).
- Interior: from the attached image keep only the ONE or TWO most
  prominent interior lines of each part, as bold gold strokes at least 3%
  of the icon's width. Drop every thin circuit trace, small groove and
  dot. Keep the design symmetric where the original is symmetric.
  Gold covers no more than a third of the icon.
- Separate parts keep clear gaps between them, wide enough to survive at
  26 pixels.

Background: perfectly flat solid magenta #FF00FF, edge to edge. Nothing
spills onto it: no glow, no haze, no shadow, no reflection, no gradient.
Centred, filling about 88% of the square canvas.
No glow, no neon, no rim light, no bloom, no texture, no marble.
Studio photograph of a forged metal object, not a cartoon, not a mobile game.
```

Processing: key the magenta, trim, fit 96px at 3% padding, measure the edge
share at 26px, and show him a sheet beside the dark and current light icon.

### (older) seven page icons still carry too much gold

**Pick this up first.** The twelve light-theme page icons were redrawn on
2026-09-30. Five of them have since been corrected a second time; **seven have
not**, and he stopped only because he hit ChatGPT's image limit: *"وصلت الحد
تبعي بانشاء الصور ... خلينا نوقف هون ونكملهم لما يرجع الحد"*.

| done (gold reduced) | still gold-heavy |
|---|---|
| overview, quests, habits, planner, stats | leaderboard, intelligence, log, friends, mail, settings, admin |

What went wrong the first time: my prompt said to redraw *every* internal line
in bright gold, thick. It worked — and the gold came out at roughly half the
icon's area, which he read at once: *"اللون الذهبي طاغي"*. On the dark set
the gold is a minority (rims only, ivory mass); the light set had inverted
that ratio. The fix is **less gold area, not darker gold** — darkening it puts
the icon back to the smudge it started as.

The corrective prompt is in the transcript; its shape is: keep the outer rim
and the few structural lines that make the object recognisable in gold, turn
every decorative circuit trace and secondary groove to the body's own black,
keep the surviving gold bright and thick, aim for about a quarter of the icon
in gold rather than a half.

The pipeline, when the seven arrive: `scratchpad/icons-light.ps1` keys the
magenta, trims to content and fits into a 96px square with 3% padding — the
same framing `Fit(cut, 96, 0.03)` gave the dark set, which is what keeps the
swap from shifting anything. Only the `$map` of name -> image number changes.
No code touches this: the filenames are what the existing
`nav-img-dark` / `nav-img-light` swap already looks for.

Source image numbers, in the session's images folder: the **dark originals**
are overview 19, quests 20, habits 21, planner 22, stats 23, log 24, settings
25, admin 26, leaderboard 28, intelligence 29, friends 30, mail 35. The
**first light batch** was 161-172 in that same order as sent; the **corrected
five** are 182-186 (overview, quests, habits, planner, stats).

Two related findings from the same pass, both already fixed:
- `.nav-img` carries `opacity: .8` and `saturate(.85)` so an inactive item
  recedes. On an ivory icon over black that dims it; on a **black icon over
  white** it lifts the body to grey and takes the gold with it. The light
  themes now use `.94` and no filter.
- Two black `drop-shadow`s predating the light themes — 12px under the
  Overview rank emblem, 3px in the status bar — read as a grey smudge on
  white. Off on the light themes. This, not the outline I briefly added, was
  the halo he pointed at twice.

### Art for the light themes (2026-09-30)

The drawn art was all made gold-with-ivory-panels, for a dark page. Measured
against a light card (#f6f3f0), the share of each emblem's solid pixels that
falls below 1.4:1 — invisible, not merely weak:

| art | on light | on dark |
|---|---|---|
| intelligence emblems | **30–53%** | 0% |
| podium first / second | 45% | 3–7% |
| row-top / row-you plates | 31% / 21% | 5–7% |
| ranks B, C, S | 19–23% | 8–12% |
| ranks G, F, D | 0–6% | — |

The failure is not "too light overall" — it is the **ivory second tone going
white on white**. The gold survives; the ivory panels become holes, so a book
comes out as an outline with nothing inside it.

**The intelligence emblems are done.** Eight light-theme files, black metal
with gold edging and gold circuitry, 189KB for all sixteen (128 + 48). They
measure 2–9% invisible on a light card, and each one mirrors its gold twin at
41–71% on dark — the pair belongs to one theme each, by design.
`SYS.intArtSrc(key, px, light)` picks the file; `intArt` and the radar each
emit both copies with `nav-img-dark` / `nav-img-light`, and CSS hides one. The
hidden copy is `display:none`, so it takes no box and no margin.

**How the light set was actually produced**, because two earlier attempts
failed: describing the shape in words does not work. My descriptions of the
existing emblems were wrong twice (three figures where there are two, the right
angle on the wrong side, the sound arcs in the wrong place), and he caught both.
What worked was **uploading the original 1254px magenta render itself** and
asking for the same image with only the metal changed. The shape comes from the
image; the prompt only carries the palette. Do it that way for the podium and
the ranks too.

The palette that was approved, after one wrong guess at dark bronze: **black
faces #121110 to #050505, every bevel edge a thin polished gold line #c8912f to
#e8c070, inset panels #141210, traces and nodes gold, an amber gem stays
amber.** The gold draws the shape and never fills a face. This is the same
language as the light-theme nav icons and the brand mark, which is why it sits
with them.

**The podium and the ranks do NOT get a second set, and that is a measured
decision, not a shortcut.** I recommended one, then took it back after looking
at what actually disappears. Of the pixels that fall below 1.4:1 on a white
card, the mean colour is `#f6e8b6` for the gold monument, `#e9e9ea` for the
silver and `#fbe999` for the champions plate — near-white specular highlights.
The mean of what survives is `#b07e2b`, `#797978`, `#b57b26`: the metal itself
is mid-tone and reads on white perfectly well. Rendered side by side, the
bronze monument is actually better on white than on black.

So the failure there is the **silhouette edge**, and `--art-edge` in
`styles.css` buys it back with four one-pixel `drop-shadow`s on the light
themes only, for zero bytes. Two further reasons a black set would have been
wrong: 1.7MB of files, and gold/silver/bronze *are* first, second and third —
blackening them spends the meaning to buy an edge.

The intelligence emblems are the exception that proves the rule: theirs was
the ivory **interior** going white, and no outline reaches inside a shape.

Read the comment above `--art-edge` before touching it. Three rules already
set `filter` on this art at higher specificity and each composes the variable;
the rank-up sheen is deliberately excluded; and the row plates are
`border-image`, so a filter on them would filter the row's text too — their
bodies measure 4% invisible, which reads as polish, so they keep their sheen.

The six podium originals are exported to the scratchpad under `refs/`
(first←68, second←69, third←74, row←130, row-you←131, row-top←132 in the
images folder) in case he ever does want them redrawn. Note the plates are
**not** plain keyed renders: `gold3.ps1` rebuilt each one's middle as a single
averaged column for CSS nine-slice, with per-plate cap widths, so a new set
would have to go through that again.

**The profile frame is built and then held back, on purpose.** It shipped in
"Frame the profile portrait" and was unwired one message later: *"لا ما بدي
تحط هاض الاطار هسا"*. Do not put it back unless he asks. The art stays in
`assets/frames/profile-circuit-256{,-light}.png` (155KB the pair) and nothing
references it. To restore it, three edits — no measuring, it is all below:

* `renderProfileModal`'s head: two `<img class="profile-frame nav-img-dark">` /
  `nav-img-light` tags inside `.profile-avatar`, before the portrait.
* `.profile-avatar` takes `--fr: 88px`, `position: relative`, `display: grid`,
  `place-items: center`, `width`/`height: var(--fr)`; `.profile-frame` takes
  `position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none`;
  `.profile-avatar .av` takes `width/height: calc(var(--fr) * .695)` and drops
  the outer hairline for `box-shadow: inset 0 0 0 1px rgba(0,0,0,.5)`. On the
  phone rule add `.profile-avatar { --fr: 80px; }`.
* Precache both files in `sw.js`.

The **.695** is the load-bearing number: the ring's hole measures 69.5% of the
ring's own width and sits dead centre, measured off the file. Any other number
either leaves a gap inside the metal or slides the portrait under it. The 512
pair and the 1.2MB master were deleted; git history keeps them.

Building it did fix something that stayed: at 375px the head's name column had
collapsed to 62px and broke an ordinary name over four lines. On phones the X
now sits in the corner instead of taking a slot in the row, the rank emblem
drops to 48px, and the name column is 100px and two lines.

Making frames a **collection** — several of them, earned and chosen — is the
cosmetics feature he deferred, not part of this pass.

Not done: whatever he names next. Every visual item named so far is closed. He works page by page and tells me what
he does not like; the fastest loop is to measure in the browser rather than
screenshot, because the pane's screenshots are unreliable and it freezes
animations while hidden.

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
10. **Stats rebuilt** from the user's reference screenshots: scope chips,
    calendar rings, all-time figures, the year grid, archiving. A Trending
    chart and an overall-rate figure were in the references and were dropped
    by the user.
11. **The long memory** (day marks), so a year grid can outlive the 120-day
    detail. It first shipped with its seal never being saved — `sealMarks` ran
    on every load and nothing reported a migration. Caught by reading storage,
    not the screen.
12. **Five fixes from using it:** a two-press delete whose confirmation was
    only a border colour, Edit opening on the Habits page instead of where it
    was pressed, half a goal reading as nothing (marks gained tenths), the
    habit icon becoming a progress ring, and the week badge removed.
13. **A day's log**, opened from the calendar, with log times recorded from
    then on.
14. **Exact fractions** while a day is still in detail — the calendar had been
    reading the mark's tenth and showing 50% for 1.1 L of 2.
15. **Groups cancelled** — see "Settled: groups are cancelled".
16. **The Comparison chart** (it was in the references, never dropped by the
    user, and had been left out without saying so), and these docs again: they
    had drifted one feature after the audit that fixed them.
17. **Comparison, second pass**, after the user looked at it: axis labels were
    several times too big on a desktop (SVG text scaling with its card), only
    every seventh day and every other month were labelled, and a 30-day month
    showed 31 buckets. Rebuilt as HTML with every label, scrolling when there
    is not room, and month buckets that follow the month's real length.

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

## AGREED: strengthening the intelligence system (2026-09-30)

He asked for suggestions on the intelligences — the first he had ever been
given about them. Four changes were agreed after reading the engine together.
They are ordered: each one makes the next safe.

### 1. The category score becomes a SUM, not an average

`avgTraitLevel` divides a category's total by how many traits it holds. The
counts are ours, not earned — self 5, bodily 7, everything else 4 — so the
same work is worth **1.75× more** in the thinnest category than the thickest.
In his own seeded data this is not theoretical: **Bodily holds 18 points of
work and reads 2.57; Social holds 11 and reads 2.75.** The radar, the centre
of the page, ranks less work above more.

Points come from EXP, not from trait count: ten points into Bodily are ten
whether it holds four traits or forty. So the divisor has nothing to do with
effort, and the sum is simply the true number.

It also unblocks everything else. Under an average, **adding a trait lowers
your score the moment it appears** (23/4 = 5.75 becomes 23/5 = 4.6 for doing
nothing wrong), so the app punishes a widening life. Under a sum, a new trait
is an empty page and costs nothing.

And it gets *more* necessary with change 2: a comprehensive list will hold
maybe 18 bodily traits against 9 musical ones, and the average would halve
one of them against the other on identical work.

Numbers on screen grow (7.0 → 35). That is display, and `maxVal` on the radar
is already relative.

### 2. One comprehensive standard trait list, written by us. The AI may not invent. — **DONE 2026-09-30**

91 traits now, 55 of them new. Read the comment above `seedIntelligences` in
`js/constants.js` before editing it: additive only, twelve per category
maximum, and ids derived from the name. The prompt rule is tightened and
`snapTraitName` in `functions/evaluation-prompt.js` puts the model's answer
back onto the person's list before it leaves the server — with
`tests/test-trait-snap.js` on it, because that logic only shows itself when it
is wrong. A name nothing on the list is close to is **dropped**, so the task
names its category alone rather than claiming a trait that was never credited.

Writing the list pushed the saved document from ~500 KB to 598 against a 500
KB guard and a 1 MiB hard ceiling, so two storage fixes came with it: a
remainder of exactly nothing is no longer stored (4,571 of 11,313 entries on a
full climb), and fractions are kept to six decimals rather than a double's
seventeen digits. 424 KB now.

---

#### The original note

`functions/evaluation-prompt.js` currently tells the model: *"Only if none of
them fits at all should you write your own."* **That line comes out.**

Why, in his words: he is building the per-user **assessment** that tells
someone their level in each intelligence. An assessment needs one shared
scale. If each account's trait list drifts to whatever the model invented for
it, nothing is measurable and no two people are comparable.

So: we write the comprehensive list; the model always picks the closest
existing trait. When it would have invented one, that is a **signal for us**
— log it, and consider adding it to the standard list in a later version.
Adding a trait stays our decision.

This also replaces the idea of letting users add their own traits, which was
proposed and then rejected for the same reason.

**Fix the misfiling while writing it:** "Sports coaching & training" currently
sits under Logical-Mathematical.

### 3. The two currencies come apart — **DONE 2026-10-01**

`developmentalShare` in `js/engine.js`, applied where a level issues its
points. `tests/test-currencies.js` holds it: a chore moves the ladder and
grows nothing, named work grows what it named, and the same EXP half-spent on
errands yields about half the growth while the ladder does not notice.

One distinction is load-bearing and is easy to collapse by accident: an
**empty** pool is not a **general** one. "general" is the evaluator saying
this builds nothing; nothing at all is the engine having no information — an
admin correction, or EXP older than any of this. The second keeps the old
behaviour, because there is no evidence that work was non-developmental.

#### The original note
### 3. The two currencies come apart

EXP raises the level and the rank — *how much you have done*. Skill points
raise traits and draw the radar — *what you have built*. Today every EXP
manufactures skill points, so the two say the same thing, and the radar
inherits work that built nothing.

The prompt already classes paperwork, bills, bookings, errands and household
chores as developing **no** intelligence and returns an empty category list.
Those tasks still pay EXP; that EXP still crosses levels; and every level
grants its full points, distributed across whatever *else* is in the pool. So
a 40 EXP bill buys part of a point in Reading. The evaluator says it builds
nothing and the engine turns it into growth anyway.

**The rule:** a level grants points in proportion to the *developmental* EXP
that paid for it. 60 EXP of reading plus 40 of bills crosses a 100 EXP level,
and that level pays 0.6 of a point, to Reading. The bill still moves the bar.

Nothing else about routing changes: points still arrive per level and still
land on the trait the task named. Fractions are already banked per trait in
`traitRemainder`, so 0.6 is not lost.

Cost, stated plainly: trait growth slows by whatever share of a person's EXP
is non-developmental. That is the point — today the radar pays out more than
was built. If it feels too slow, the lever is `RANK_POINTS_PER_100_EXP`, not
putting the bills back.

### 4. The assessment — **DONE 2026-10-01**

Forty statements, one per trait, asked round-robin so five about one category
never arrive together. Behaviour in a stated window, never an opinion of
oneself. Shown once on a first open, **no skipping**, and `state.assessment`
is what closes the door for ever.

**It grants points, and the strictness is in the shape of the sum** — which is
the only kind that holds, because a self-report cannot be checked:

- **A budget, not a total.** `ASSESSMENT_BUDGET` (40) is what the whole test
  may hand out however it is answered. The answers decide WHERE, never how
  many. Agreeing strongly with all forty spreads the same forty across eight
  categories instead of multiplying them, so inflating every answer is
  pointless by construction rather than by policing.
- **`ASSESSMENT_CATEGORY_CAP` (12)**, and the surplus is **not** redistributed.
  Claiming one field and nothing else must not beat a year of real work; running
  the overflow into the other answers would hand it straight back.
- Only agreement earns: the weight is what an answer exceeds the midpoint by,
  so "neither" is worth nothing and disagreeing is worth nothing more.
- **Points only. No EXP, no level, no rank** — the mirror of the split in
  applyExpDelta, and deliberate. The ladder stays earned.
- **"I have never tried this"** is worth nothing and is kept in
  `assessment.neverTried` with its trait. Never tried and tried-and-gave-up are
  the same zero on the radar and are not the same invitation; the weekly
  suggestion wants exactly this.

**`player.scoreFloor`** is written at the same moment and is why the radar's
ninety-day outline does not spend three months presenting a questionnaire as
work. It is kept OUT of the score log on purpose: a day's snapshot is
rewritten as that day goes on, so the first quest finished on day one would
have swallowed the starting picture.

**Existing accounts get it too, and that is settled (2026-10-02).** He met
the test on his own admin account, took it for a new-account screen, and
asked whether accounts had been deleted (none had). Asked whether old
accounts should skip it or take it without points, he said there will be no
old accounts: he deletes the test account himself, and the admin account
stays only as the admin, its progress near-wiped. So no special path. When
that wipe happens, clear `state.assessment` and `player.scoreFloor` too, so
the test runs again on the clean slate.

**The save bug it shipped with, fixed 2026-10-02.** `assessment` was not in
`isValidSave`'s hasOnly list, so finishing the test refused every cloud save
for that account. Added and deployed; `tests/test-save-keys.js` now checks every
top-level key the app can write against the rules. The admin account also gets
a **Skip** (`SYS.skipAssessment`): grants nothing, takes the current scores as
the floor. He asked for it for his own account, having no time for forty
questions.

**A new account now starts at zero.** The seed used to carry one person's own
standing — Reflection & thinking 13, Sports 9 — as the opening position of
every account ever created. The assessment paints that picture now, from the
person in front of it. (`seedTasks` is still his: "Reading Animal Farm" and
the rest. Not addressed.)

Two bugs worth remembering, both the same shape: `q` is the six-decimal
rounding helper in engine.js, and both times a loop variable named `q` shadowed
it. The first broke the banked fractions; the second keyed every granted
category as `"undefined"`, which the test did not catch because it only checked
the total. It checks the keys now.

#### The original note
### 4. The assessment measures the eight categories, not every trait

A comprehensive list cannot be tested trait by trait — 150 traits is a 150
question test nobody finishes. The test asks about five things per category,
around forty questions, and sets where that **category** starts. Traits grow
from the work itself afterwards. Nobody is asked to rate their embroidery.

### 5. A second polygon on the radar, behind a switch — **DONE 2026-10-01**

`recordScores` writes where every category stood at the end of a day, on every
EXP event, pruned to `SCORE_LOG_DAYS` (120, so the ninety-day window can reach
past days with no activity). `recentScores(state, 90)` is now minus then.

A **snapshot, not a ledger of points**, and that is the whole design: a ledger
would have to be undone exactly whenever EXP is taken back. This is simply
what the scores were — an undo lowers today's and the difference follows on
its own, which is why the outline can never go negative or outrank the total.

The switch is under the radar, not in Settings: it changes what that one
drawing says. `settings.radarRecent`, off by default. The key line only shows
while the outline does.

#### The original note
### 5. A second polygon on the radar, behind a switch

Nothing decays and nothing should — a number that falls because you were ill
for a month is a punishment, and people leave over it. Instead the radar can
carry two outlines: the lifetime total, and the points earned in the **last 90
days**. The gap between them is the whole story — *built years ago, untouched
since*.

**He asked for it behind a user switch:** the lifetime total is the primary
and always drawn; the 90-day outline is a setting the person turns on, off by
default.

### 6. Named tiers for a trait level — **DONE 2026-10-01**

`SYS.TRAIT_TIERS` / `SYS.traitTier(level)`: novice 1, practised 10, skilled
25, advanced 50, master 100. Roughly doubling, so the first arrives soon
enough to be felt and the last is worth arriving at. Level 0 has no tier — an
untouched trait has not started. Shown in the trait row beside the level.

#### The original note
### 6. Named tiers for a trait level

A level has no scale, no ceiling and no milestone — "Reflection & thinking:
13" is thirteen of what? And unlike every other ladder in the app its cost
never rises: point 80 costs what point 1 did. Named tiers every so many levels
(novice / practised / skilled / …) give the number a place to be, and give the
log something to announce.

### 7. The intelligences have to reach the rest of the app — **DONE 2026-10-01**

**Half of what I proposed for this was already built, and I should have looked
first.** `suggestQuests` already aims at neglected categories ("a category
sitting at zero is the strongest signal there is"), is cached one set per
week on purpose, and surfaces on the Quests page. Giving it a per-category
focus would mean an uncached AI call per category and would break that
caching, so it was left alone. The radar was already on the overview and on
the profile too.

What was actually missing was that **nothing was earned from a category and
nothing led anywhere**:

- **`CATEGORY_EMBLEM_AT` (100).** Past it, a category's emblem is worn beside
  the name — in the status bar, which is on every page, and on the profile,
  which other people see. Derived by `earnedCategories`, never stored: nothing
  to migrate, and a category that falls back below the bar stops being worn on
  its own. Three at most, strongest first. **The number is a guess and should
  be the first thing tuned once there is data** — a hundred points is ten
  thousand EXP routed into one category at the opening rate.
- **The overview's radar leads somewhere.** It showed the same drawing as the
  intelligence page and could not be acted on, so it carries the same
  strongest/weakest buttons now. `intel-open` had to learn to change pages
  first: from the overview it was expanding a card on a page nobody was
  looking at and appeared to do nothing.

#### The original note
### 7. The intelligences have to reach the rest of the app

They gate nothing, unlock nothing and touch no other page — a mirror hung to
one side. The cheapest tie-in: the weakest category drives a weekly
suggestion ("one quest for Musical this week"), and a category crossing a
threshold earns a title.

### Still open — raised, not decided

- **A visible pool of unattributed points**, placed by the person, instead of
  silent weakest-first placement. `player.bankedPoints` exists in the model
  already and is never spent.

  **This is also the answer to the other open question**, and was offered to
  him as one thing rather than two: *what the engine should do when a trait
  name does not match anything*. Today `matchTraitIndex` returns -1 and the
  point falls silently onto the **weakest trait in that category** while the
  task card displays the name the model gave — the card says one thing and
  the award does another, the same family as the bug fixed in session 5,
  through a door still open. Change 2 makes it rare rather than closing it.
  Holding the point and asking closes it.

  Note the domain shrinks a long way once changes 2 and 3 land: no points
  from non-developmental work, no invented names. What is left is rare
  enough to be a moment rather than a chore — with a "place them for me"
  button doing exactly what the engine does today for anyone who would
  rather not.

## The seeded tasks — **DONE 2026-10-01: a new account starts empty**

He chose: remove them and make signing in the way in. `defaultState` opens
on `tasks: []`. Signed out, the empty Quests and Habits pages offer **Sign
in** (`open-settings`, the same button the Ranking page uses) instead of add
buttons that could only end in "sign in to add". The list survives as
`SYS.legacySeedTasks`, used only by `syncSeedTaskTargets` to fix the copies
older accounts still hold — **existing accounts keep their tasks**; nothing
was taken from anyone. `test-state-merge.js` takes that list explicitly for
its two-device case. The starting `exp: 55` went too, at his word: a new
account opens on zero EXP.

### The original note

Zeroing the seeded trait levels fixed half of this; `seedTasks` is the other
half and is worse. A brand-new account opens with:

```
[quest] Reading "Animal Farm"              500 pt
[quest] Commitment in Exercises two weeks 1000 pt
[quest] Writing with the other hand        300 pt
[quest] Performing daily habits            100 pt   40% DONE
[quest] Fast typing on the keyboard       2000 pt   30% DONE
[habit] Drink water                         20 pt
[habit] Deep work session                   40 pt
```

Three things wrong, in order of seriousness:

1. **3,900 pt of quests that no evaluator priced.** Every other point of EXP
   in this app comes from `evaluateTask`, is recorded in `aiPrices`, and is
   checkable afterwards. These have no `priceId`, so they are free unverified
   EXP handed to every account on the leaderboard. That is an anti-cheat hole,
   not a matter of taste.
2. **Two of them open part-finished** — 30% and 40% — for work nobody did.
3. They are one person's own list: his book, his two-week challenge, his
   typing drill.

**Before ripping them out, settle what a new account should open on.** The
assessment is the onboarding now, and the weekly suggester proposes 3–5
properly priced quests — but `suggestQuests` needs sign-in, so a signed-out
first run would land on an empty Quests page. Check whether a signed-out user
can create a quest at all (the evaluator is a cloud function); if they cannot,
the seeds were the only thing they could ever do, and emptying them makes
signed-out mean nothing works. That is the decision to put to him.

## PLANNED NEXT

**The original plan is now complete.** Everything below is new ground.

**Agreed for later (2026-09-16), in no fixed order — start none unprompted:**
subscriptions; a custom domain on Firebase Hosting; the per-user intelligence
assessment; an in-app feedback section; a big overhaul of the icons plus more
and better interactive animations; user profiles with part of the data public;
a friends section where users can challenge and compete with each other
(distinct from the cancelled groups). Profiles and friends open the owner-only
privacy model, so they start with rules design.

Theme designs (section 1 below) are **done** — kept for the engine notes only.


### 1. Theme designs from Claude Design
The user said they'd send palettes. The engine is ready: adding one is a
single object in `SYS.THEMES` and it appears in the dropdown automatically.

### 2. Leaderboard follow-ons — in the plan (2026-09-28)
The user put these in the plan on 2026-09-28. They are not scheduled: build
them when the user picks them, not before. Recommended order, strongest
first:
1. **Making the EXP fields server-authoritative** (see Known Limitation).
   This one matters most now that the numbers are public, and it should
   land before strangers use the app — before the Play closed test at the
   latest.
2. **Refusing unverified journal entries outright**, once tasks predating
   recorded prices have aged out (see the EXP journal section).
3. **Pagination past the top 100.**
4. **A filter per intelligence category.** The friends tab and the
   this-week mode already exist; this is the one filter still missing.

---

## Settled: groups are cancelled

Shared habits between people. Raised twice, deferred twice, and then dropped
deliberately after the user asked whether there was any point to it. The
reasoning, so nobody re-proposes it:

- **The leaderboard already answers it.** "Where am I against other people" is
  built, server-authoritative, and cost nothing extra.
- **It is the one feature that would force the privacy model open.** Today the
  rule is "each person reads their own state, full stop", with the leaderboard
  as a single tightly-scoped projection that only a Cloud Function writes. A
  group means A reads part of B's state — which needs either a projection per
  group, with its own triggers and rules, or looser rules on the state
  document itself. That is the one architectural decision in this app worth
  being most reluctant to undo, and it would be undone for a feature nobody
  asked for.
- **Its audience is currently zero.** It only pays off once other people are
  really using the app.

What would reopen it: the app actually going to other people (a store listing,
or just handing it to friends). Then it is a different question with a real
audience — but that decision is expensive on its own and has not been made.

The cheap version, if the itch is ever "I don't want to be doing this alone":
a shareable read-only snapshot — an image or a page the person chooses to
share — which grants nobody access to anything and touches no rules.

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
   **But make it invisible when it is only for you.** In session 8 a
   "Check reminders" screen was built to explain missed reminders and the user
   rejected it outright — they are a user, not a debugger. What found the bug
   was a server log line and `reportSaveFailure`, which the user never sees.
   Ask them only to repeat the action.
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
## EXP for priced tasks is computed on the server (verification plan, phase 2)

The device no longer sends the EXP a priced task earned. It sends what
happened — `{ priceId, kind: "quest", completion }` or `{ priceId, kind:
"habit", day, done }` — to the callable **`recordProgress`**, which pays the
difference against a ledger it keeps per task at
`progressLedger/{uid}/prices/{priceId}` (quest: EXP paid; habit: EXP paid per
day plus a `legacyExp` lump) and writes the journal entry itself with
`server: true`. The rules in `functions/progress.js`, tested in
`tests/test-progress.js`:
- Sending a report twice pays nothing; reopening or clearing returns exactly
  what was paid.
- A quest price can't be spent as a habit or the reverse (editing a task
  between the two keeps its priceId).
- A habit day may be marked only today or up to **3 days back**
  (`BACKFILL_DAYS`, mirrored as `SYS.HABIT_BACKFILL_DAYS`; the app greys out
  older dots and `refuseOldDay` in main.js stops the other controls — not
  inside `logHabitDay`, which also replays history for stats and tests). Clearing is
  allowed for any day. "Today" comes from the zone the device sends — a false
  zone moves the window by about a day at most.
- The first report for a task seeds its ledger from the old journal entries
  that named its price, so nothing finished before phase 2 is paid twice.
- A resolved appeal moves the recorded price (`appeals` now carry `priceId`).
- `applyAdjustment` writes its own journal entry; its grant has
  `journaled: true` and the device applies it without reporting it.
- The rules no longer let a device write an `expEvents` entry with a
  `priceId`. Only tasks with no price still send their own deltas, counted as
  unverified.

**The evaluator also estimates time** (verification plan, phase 3). Every
pricing path returns and stores two more numbers on the price record:
- `effortHours` — the fewest hours of hands-on work the task plausibly needs;
  for a habit, **one repeat** (0.5 for a half-hour session, 0.03 for a
  two-minute stretch).
- `minDays` — the fewest whole calendar days that must pass before it can
  honestly be finished. 0 for almost everything; 30 for "a month without
  sugar", 14 for "exercise every day for two weeks".

The guidance lives in `AI.CALIBRATION`, so the evaluator prompt and the
weekly-suggestions prompt share it; both schemas require the two fields, and
the 14 worked examples carry them. `PROGRESS.cleanEstimates` clamps them
(≤2000h, ≤400d) and floors a **quest** worth more than ~250/hour that claims
neither hours nor explanatory days — habits are exempt from the floor, since
quitting something takes no time. A **habit repeat** is instead capped from
above: ≤`MAX_HABIT_REPEAT_HOURS` (14) and `minDays` forced to 0, because a
repeat happens inside its own day. The eval found why that matters — "Climb
Everest" entered as a *weekly habit* came back at **300 hours a repeat**,
which in phase 4 would have locked that habit for weeks. Library habits keep the estimates in the shared
`libraryPrices` cache; rows cached before this read back as 0/0.

**The price itself now comes off the hours** (the user called the old scale
over-generous, and it was inconsistent: two weeks of exercise earned 143/hour
against a marathon's 30). `AI.CALIBRATION` prices a **quest** on a tapering
hourly rate — 60/hour for the first 10 hours, 35 to 30 hours, 20 beyond — so
1h=60, 6h=360, 30h=1300, 60h=1900. A quest that is hard because it *goes on*
(no phone for three weeks) is priced at **15 per day held**, and a quest with
both takes the **larger, never the sum**. Two floors under it:
- **Scope cap:** a quest naming nothing measurable — no pages, hours, duration
  or deliverable — is capped at **150**, however grand it sounds. This is the
  hole the user found by hand ("finish the work on my app" → 1800).
- **Small habits:** a repeat under five minutes is capped at **5**. A minute of
  drinking water used to earn 15 — 900/hour against a marathon's 30 — and
  phase 4's hour-based daily cap would never have limited it, since trivial
  habits consume no hours. **Phase 4 must therefore also charge a minimum per
  completion (~2 minutes)**, or fifty trivial habits still land in one day.
  Quit-habits ("one clean day") stay priced by difficulty, not minutes: 10-20.

The worked examples were re-priced onto this scale, and the seed anchors moved
with it: reading an ordinary novel 500 → 360, two weeks of exercise 1000 → 420,
three weeks without a phone 700 → 315, coaching a season 1200 → 1900.

**Nothing in the app reads them yet** — phase 4 (the unlock time and the
14-hour daily cap) is what makes them visible. `evals/run.js` grades them
where a case states `effortLo`/`effortHi`/`minDaysLo`/`minDaysHi` and reports
an `effort` line; `tests/test-progress.js` covers the clamps and the floor.

**A materially edited task is priced again.** Editing never used to
re-evaluate — the comment said so, to stop somebody editing until they liked
the number — which left a far larger hole the user found in one try: a quest
priced 1800, retitled "play one football match", keeps 1800, and since phase 2
the *server* pays from that stored price. Now an edit that changes what the
task **is** (title, description, quest/habit, quit flag, schedule, unit,
amount) goes through the evaluator again; an edit to icon, priority or
reminders does not. The daily evaluation cap is what stops the fishing.

The re-priced task carries `replaces` (the retired priceId) on its next
report. `recordProgress` moves that ledger across once — `transferLedger`, a
habit's days collapsing to one lump since the new price may be worth a
different amount per day — and stamps the old ledger `movedTo`, so editing in
a circle cannot collect twice. Worked example, tested end to end: 1800 at 60%
(1080 paid) re-priced to 40 reports **−1056**, leaving the 24 that 60% of 40
is worth. `updateTask` also reports a **zero** delta when only the price id
changed, or the transfer would never happen and the next repeat would be paid
from scratch.

### The reflection question (verification plan, phase 5, step A)

**Nothing calls this yet** — step B wires it in. A quest worth
`THRESHOLD_PT` (300) or more has its points split in two, each half released
by one short answer: at 50% "What have you done so far?", at 100% "What did
you take from it?". The time lock stops a task being recorded early; this is
what makes waiting it out and pressing done without doing anything leave a
record. Habits are never asked.

`functions/reflection.js` (pure, `tests/test-reflection.js`):
- `payableExp` — each half is independent: a rejected first answer forfeits
  the first half only. `heldExp` is what shows as "waiting for your answer".
- `dueCheckpoint` — the question a quest is waiting on.
- `afterJudge` — a hold starts the admin clock at the **first** hold and never
  restarts it on a rewrite, or rewriting every four days would keep an answer
  from the lenient look for ever. `MAX_ATTEMPTS` (3) rewrites, then it waits
  for a person. `dueForLenient` after `ADMIN_WINDOW_DAYS` (5).
- `afterAdmin` is final either way.

`functions/reflection-prompt.js` — the judge, one request per answer, system
prompt cached. It decides one thing: is this plausibly written by someone who
did the task. Not writing, length, spelling or language. STRICT holds
gibberish, a copy of the title or description, something unrelated,
instructions to the judge, and an answer generic enough to fit any task;
LENIENT (the look after five days with no admin) accepts generic answers that
are still about this task.

`evals/reflection-run.js` over `evals/reflection-cases.json` (21 cases, run
`--reps 3`). Two things the **first** run caught, both fixed:
- **Lenient was not lenient** (72%): stated only in the system prompt, the
  mode lost to the strict rule the model had read first. The rule for the mode
  now ends the user message, right where the decision is made.
- **Reasons came back in the wrong language** — an English answer got a reason
  in Ukrainian once and in Norwegian once. "Reply in the language of the
  answer" is not reliable, and the schema description said the same thing and
  had to change too. The app now names the language (its interface language;
  without one, Arabic script means Arabic, else English), and the runner grades
  it.

After the fixes: strict, lenient, honest-answers-accepted and
reason-in-the-right-language all **100% across 63 calls, $0.086**.

### Suspicious accounts (verification plan, phase 6 — the last)

`functions/suspicion.js` (pure, `tests/test-suspicion.js`) holds the signals;
**points are never touched** — the only consequence is being taken off the
public ranking until an admin looks. Every threshold was chosen so an honest,
intense week does not trip it, and the tests that expect nothing say so.

| Signal | Rule | Hides? |
|---|---|---|
| `effortStreak` | >12h of effort a day, 5 days running (last 30) | yes |
| `backfillBurst` | 10+ past habit days marked inside 60s | yes |
| `dailyExp` | >2,500 task EXP in one day (last 7) | yes |
| `rejections` | 2 answers rejected within 30 days | yes |
| `unlockRush` | 7 of the last 10 quests finished ≤2 min after opening | **no** |

`unlockRush` only notifies: the app itself tells people when a task opens, so
an honest person who finished early and pressed the moment it opened looks
exactly like a cheater. Flip `hides` in `SIGNALS` if that changes.

`suspicion/{uid}` = `{ uid, evidence, flag, alertSeq, lastAlert }`, admin-read
only (the account cannot read its own — the evidence is what gaming the
ranking would want). Evidence is added where it happens, then everything is
re-evaluated in `recordSuspicion` (a transaction; best effort, never blocks
the work it watches):
- `recordProgress` — a past habit day marked (backfill), a quest finished
  (minutes after its unlock), any effort charged (re-checks the streak).
- `recordExpEvent` — verified task EXP per UTC day (admin adjustments excluded).
- `reviewReflection` / `lenientReflections` — a rejected answer.

A hiding flag sets `leaderboard/{uid}.hidden`; the app filters hidden rows and
tells the owner "Your ranking is under review". `notifyAdminsOfSuspicion` (a
trigger on `alertSeq`) sends the push, so no evidence-gathering function needs
the VAPID key. `reviewSuspicion` restores (clears, unhides, stamps
`clearedAt`) or keeps it hidden (stamps `reviewedAt`, drops out of the queue
until newer evidence arrives).

**A bug the tests caught:** day-based evidence was dated at the END of its
day, so a restore at noon was older than the evidence it had just reviewed
and the next report flagged the account again — "restore" never held. Day
evidence is now dated at the start of its day.

Known gaps: `fetchMyRank` still counts hidden rows, so a position can be off by
the number of hidden accounts above it; and an account whose leaderboard row is
deleted and recreated (a name released and reclaimed) comes back unhidden.

### The reflection question, wired in (phase 5, step B)

**Server.** `recordProgress` reads the quest's two `reflections/{uid}__{priceId}__{cp}`
documents and passes a gate to `settleReport`, which pays
`min(full, max(payableExp, grandfathered))`. `grandfatheredExp` is what the
ledger had already paid the first time it is seen under the gate
(`gateVersion: 1`) — progress counted before this shipped stays counted. The
ledger now stores `completion` as well as `exp`, because "has this quest
reached its question" is about progress, not money.

- `submitReflection` — checks the quest is gated and has reached the
  checkpoint (from the ledger, never the device), spends one evaluation from
  the daily allowance, judges STRICT, and on accept pays the released half
  straight away through `payReleased` (idempotent, so the app's own follow-up
  report pays nothing). The **first** hold pushes a notification to admins; a
  rewrite of the same answer does not.
- `reviewReflection` (admin) — final either way; accepting pays.
- `reflectionStatus` — statuses and `grandfathered` for the app.
- `lenientReflections` — every 6 hours, answers held 5 days get the LENIENT
  look; a lenient "no" rejects rather than leaving it held for ever.
- Rules: `reflections` readable by its owner and admins, **never written from
  a device** — an answer markable accepted from the app would release its
  points unread.

**Two bugs found while wiring, both fixed:**
- **Effort was charged on payment, not progress.** A gated quest moves forward
  while paying nothing, so that progress skipped the time lock and then
  collected in full on acceptance. The lock and cap now key on completion
  moving up.
- **The re-price transfer wrote before all reads were done** (phase 4).
  Firestore refuses a read after a write inside a transaction, so every report
  on a re-priced task would have failed. The retired ledger is now written in
  the write phase.

**Client.** `engine.js` mirrors the gate — `isGatedTask`, `payableQuestExp`,
`heldQuestExp`, `dueReflection`, `ensureGateSeen` — so what the device grants
is what the server pays; `tests/test-reflection.js` checks the two agree in
all 1,536 combinations of price, completion, answer states and grandfathered
EXP. A third bug surfaced here: the journal hook only fires when EXP moves, so
progress on a gated quest (which pays nothing) was never reported, the server
never learned the question was due, and the answer was refused as premature —
points held for ever. `reportProgress` / `SYS.onProgressReport` now send a
report whenever completion changes. The same hole meant a re-price at an equal
value never reported its transfer.

The task row shows "N xp held until the question at 50%", "N xp waiting for
your answer · Answer", "waiting for review", or "Answer not accepted — reason".
The sheet asks the question in the interface language, says the admin may
read the answer, and keeps the draft when an answer is held so the reason can
be acted on. The admin page lists held answers with Accept / Reject.

### The planner (day list, events, reminders)

A section with **no points, no AI and no ranking**, so none of the anti-cheat
machinery has to reason about it. `js/planner.js` (pure, `tests/test-planner.js`)
holds `state.planner.todos` — `{ id, title, day, done, doneAt, createdAt, from, asked }`.
It rides in the saved state, so `firestore.rules` lists `planner` among the
allowed keys (and caps `todos` below 2000). **Deploy the rules before the
client**, or every save carrying a planner is refused.

- `normalizePlanner` runs in `normalizeState`: drops junk, keeps 180 days,
  caps at 1500 items (oldest days first). Deterministic for a given day.
- The morning question (`pendingCarry` / `carryTodos`): unfinished items on a
  day that is over and not yet asked about. Chosen ones move to today and
  remember `from`; the rest get `asked` and stay put. An item written straight
  onto a past day starts `asked`. `maybeAskCarry` in main.js shows it only when
  no other modal is up — after the cloud pull when signed in, 2.5s after boot
  when not, on return to the app, and on opening the planner.

**Phase 2: events.** `state.planner.events` (rules cap < 1000; the planner
keeps 600, dropping those that ended longest ago). An event is a series:
`{ id, title, start, allDay, from, to, repeat: { type: none|daily|weekly|monthly,
days, until }, skip: [day], edits: { day: { title, from, to } }, createdAt }`.
Spans: `event.span` = days after the start day it ends (0-62); the form sends
an `end` date. Same day needs `to > from`; across days any times. Drawn to
midnight on the start day, whole on days between, to `to` on the last
(`carriedOn` / `timelineOn`; carried parts have `spill` and the start day's
`day`). Week and month use `coveringOn`. An event stored before spans with
`to < from` reads as span 1. Reminders count from the start only. Monthly
`repeat.monthBy`: `date` (clamped to a shorter month's last day), `weekday`
("the third Tuesday"; a fifth-week start means the last one), or `lastDay`.

Drag on the day timeline (main.js, "dragging events"): mouse drags after 4px;
touch needs a 380ms hold, and a swipe that starts on a block scrolls the
timeline by hand (blocks are `touch-action: none`). Quarter-hour snap; the foot
(`.tl-resize`) changes the end; carried morning parts don't drag. A repeating
event asks this-one / this-and-following (`ui.modal = "eventMove"`); Cancel
re-renders it back. The click after a drag or swipe is swallowed.

Deferred by the user, to fix later: the 6-month pruning, and edits made on two
devices before they sync (whole-document sync).

- `updateEvent(state, id, day, input, scope)`: "this" writes `edits[day]`, or —
  when the date or all-day changes — skips the day and adds a one-off;
  "following" ends the series the day before and starts a new one (from the
  first day it is an in-place edit). `deleteEvent` mirrors it ("this" skips,
  "following" ends it, "all" removes).
- Views: `ui.plannerView` day / week / month over one anchor (`ui.plannerDay`).
  The day view is the to-do list plus a 24h timeline (`layoutDay` puts
  overlaps side by side); `renderPageInto` keeps the timeline's scroll across
  re-renders. Week and month collapse to lists / dots below 1000px.

**Phase 3: reminders and habits.** `event.reminders` = minutes before the
start (0 = at the start; at most 5, at most a week back). An all-day event's
count back from 09:00 on its day. `functions/event-reminders.js` decides them
inside `sendReminders`: it mirrors the occurrence rules of js/planner.js
(`tests/test-event-reminders.js` walks both over 800 days), looks up to a week
ahead, sends one notification per device per minute under tag `event` (so a
habit reminder in the same minute is not replaced), worded in the account's
language from a small table, and records `ev:<id>@<day>@<offset>` in the same
`reminderSent` doc as habits. It never looks back across local midnight.

`settings.plannerShowHabits` (default false, toggled in Settings): habits due
that day as read-only chips on the day view and a "Habits x/y" line per day in
the week view; tapping one opens the Habits page.

### Public profiles (social plan, phase 1 of 3)

`functions/profile.js` (pure, `tests/test-profile.js`). A profile is two public
docs read together: `leaderboard/{uid}` (name, journal EXP — as before) and
`profiles/{uid}` (server-written only; rules: read if signed in):
- `categories` (average trait level per intelligence) and `topTraits` (3) —
  `mirrorProfile` trigger on `users/{uid}`, only when the projection changed;
  `joinedAt` from `userDirectory.createdAt` on first write.
- `avatar` (an id from `AVATARS`; the same list is `SYS.AVATARS`, test keeps
  them equal) and `bio` (≤120, one line) — `updateProfile` callable, 20
  edits/day, bio **moderated** by Claude Haiku 4.5 (`moderateText`; refuses
  with `details.code = "not-allowed"` + reason; if the check itself fails the
  save fails, never passes unchecked). `claimUsername` moderates new names the
  same way. Eval: `evals/moderation-run.js` (19/19, < 1 cent).
- Never public: task titles, notes, planner.

Safety: `reportUser` (reason name/bio/cheating/other, 10/day, one per
reporter+target in `userReports/{reporter__target}`, admin push) and
`reviewReport` (admin: dismiss / clearBio / releaseName — frees the username at
once, drops the leaderboard row; closes all open reports on that person).
Blocks: `users/{uid}/blocks/{otherUid}` = `{at}` written by the owner;
enforced by the friends and race callables (phases 2–3).

UI: leaderboard rows are buttons → profile modal; Settings → "My profile"
(edit avatar and bio); Report / Block on others'; admin "Reported players"
queue. Decisions behind all this: memory `the-system-social-plan`.

### Friends (social plan, phase 2 of 3)

`functions/friends.js` (pure, `tests/test-friends.js`). `friendships/{a__b}`
(uids sorted) = `{ users, status: pending|accepted, from, to, via? }`,
server-written; rules let each side read its own; the app listens with
`array-contains` (composite index users+status in firestore.indexes.json,
used by the server's friend count).
- `sendFriendRequest({uid}|{name})` — name via `usernames/{key}`; a block is
  said plainly (the user's call): `blocked-by` ("X has blocked you") or
  `you-blocked` (unblock first), with the name. The rules refuse
  `profiles/{uid}` to anyone its owner blocked, so the blocked still see the
  name on the ranking but the profile (and Compare) shows the block message.
  Also refuses self,
  full (200); asking someone who asked you accepts; 30/day. Push in the
  receiver's language (`notifyUser`).
- `respondFriendRequest`, `removeFriend` (unfriend / withdraw / refuse),
  `createInvite` (token, 7 days, 10/day) + `acceptInvite` → accepted at once.
  Link: `…/#invite=<token>`; the app keeps it in sessionStorage until signed in.
- Blocking in the app also removes the friendship. Settings has a "Blocked
  players" list (`refreshBlockedList`: the owner's `blocks` ids → current
  name and avatar via fetchProfile) with Unblock, so a block can be undone
  without finding the person again.
- Weekly EXP: `recordExpEvent` now updates `leaderboard/{uid}` in a
  transaction with `weekKey` (ISO week, UTC) and `weekExp` beside totalExp;
  the app shows 0 for a row whose weekKey is not this week
  (`SYS.currentWeekKey`, kept equal to the server's by tests/test-profile.js).
- UI (reworked at the user's request): a **Friends section** of its own
  (nav `friends`): player search, invite link, requests in/out, the friends
  list (Compare), and the blocked list — beside the main column on a wide
  screen, below it on a phone (it left Settings). The Ranking page's Friends
  tab is only the friends ranking (all-time / this week). Nav badge = incoming
  requests.
- Search (`functions/search.js`, `tests/test-search.js`): `searchPlayers({q})`
  ranks every claimed name — exact, then prefix, then a word start, then
  containing, then near misses (edit distance counting a swap as one; Arabic
  أ/ا, ة/ه, ى/ي folded). Names live in `nameIndex/{0..15}` = `{ n: { key:
  {uid, name} } }`, kept by claimUsername (in its transaction) and
  reviewReport's releaseName; built once from `usernames` on the first search
  (`nameIndex/_meta`), and held in function memory for a minute. 300/day.
- Profile modal:
  profile shows Add / Accept / Requested / Friends + Remove (two taps) and
  Compare (two radars on one chart + a table). Push taps land on `#friends`.

### Weekly races (social plan, phase 3 of 3)

`functions/races.js` (pure, `tests/test-races.js`). `races/{id}` =
`{ users (sorted), challenger, opponent, metric: "total"|intelligence key,
status: pending|active|done|declined|cancelled|expired, createdAt, startAt,
endAt, scores, winner (uid or null = tie) }`, server-written; each side reads.
- `createRace({uid, metric})` — friends only, blocks said as in friends, one
  open race per pair, 5 open per person, 10 challenges/day; metric must be one
  of the challenger's intTypes. `respondRace` (accept → 7 days from now),
  `cancelRace` (challenger, pending), `raceStatus` (live scores).
- Scores come from `users/{uid}/expEvents` between start and end (never the
  app): admin adjustments never count; unverified entries count only while
  COUNT_UNVERIFIED_EXP does. An intelligence race counts an entry only through
  its price's `types`, split evenly — **prices now store `types`**
  (evaluateTask, suggestQuests, priceLibraryHabit); older prices have none and
  count in total races only.
- `settleRaces` (every 15 min): finishes due races in a transaction, bumps
  `profiles/{uid}.raceWins|raceLosses|raceTies`, pushes both (result wording in
  friends.js RACE_WORDS); pending challenges lapse after 3 days.
- UI: a Races panel in the Friends section (incoming, live with a score bar
  and time left, waiting, last 5 results), Challenge on friend rows and
  friends' profiles (metric picker), race record on profiles, nav badge counts
  challenges. Indexes: races users+status, status+endAt, status+createdAt.

### Two devices: merged, live (js/state-merge.js)

The state stays **one document** (`users/{uid}.state`) — the server reads it
in several places (reminders, leaderboard, evaluator), so splitting it was the
riskier road. What changed is how two copies meet:

- `base` = the last copy this device knows the account held (localStorage
  `the-system:syncBase:<uid>`, set on every landed save and every copy taken).
- `SYS.mergeStates(base, local, remote)`: tasks by id → field by field; a
  habit's `days` / `marks` / `volByMonth` by date key; settings by key; name on
  its own; the **standing** (player minus name, intelligences, levelHistory,
  log, dailyStats) as one piece — one side changed it → that side; both →
  the account's, `standingConflict`, and main.js flushes the EXP queue and
  reconciles from the journal. Same value changed on both → the account's.
  Deleted on one side and changed on the other → kept.
- Saves are a **transaction** (cloud.js `writeNow`): read the account's copy;
  if it moved since `base`, merge before writing; the app adopts the merge
  (`setMergedWriteHandler`, keeping anything done meanwhile). Offline, the
  transaction is retried on `online` instead of raising the failure notice.
- `watchState` = onSnapshot on the user doc; own writes are recognised
  (`recentWrites`) and skipped; others go to `onRemoteState` → take (nothing
  unsaved here) or merge.
- The "which copy?" question is **gone** (the user's call). A device with no
  base for the account takes the account's copy (`resolveOrAsk` no longer
  asks), discarding signed-out progress and — when it never synced with this
  account — the EXP queue that progress made, so the journal is not credited
  for it. The syncChoice modal code is now unreachable.
- Tests: `tests/test-state-merge.js`, and the transaction/merge path in
  `tests/test-save-queue.js`.
- Live polish: the save debounce is 200 ms (planner 150 ms); a copy taken
  from another device re-applies the language and raises that change's
  notifications on this device too (`standingNotifications`).
- `reconcileExpWithServer` now reads the journal total twice, 6 s apart, and
  corrects only a figure that held still against a local standing that held
  still, not within 12 s of adopting another device's copy; otherwise it looks
  again (up to 4 times). The old single read 4 s after a flush could land
  mid-way through the recordExpEvent trigger (a cold start alone is seconds)
  and "correct" a right standing, with nothing to put it back.

### The planner is stored item by item (js/planner-sync.js)

The planner is **not in the saved state** any more. `Storage.save` and the
cloud state write both strip `state.planner`; `state.planner` is only the
in-memory view, rebuilt from the item store after every load
(`SYS.PlannerSync.view()`), and `runGameAction` commits it back.

- Device copy: localStorage `the-system:planner` = `{ uid, items: {id: {kind,
  data, u, deleted}}, outbox: [id], cursor }`. `u` = ms of the device's change
  (newer wins); a deletion is a tombstone; `cursor` = server time of the
  newest change seen.
- Server: `users/{uid}/plannerItems/{id}` = `{ kind, data, u, deleted, s }`,
  `s` = serverTimestamp (rules require it; delete is refused). The app listens
  to `s > cursor`, so a device reads everything once and then only changes.
- **Nothing is sent before the server has been heard from once** — otherwise a
  device holding an old copy of something deleted elsewhere would write it
  back (the test caught exactly that).
- A planner found inside an old state (local, pulled, or an imported backup)
  is absorbed: only ids never seen, at `u: 1`, so any real change or tombstone
  wins. Comparisons of local vs cloud state use `stateOnly(state)`.
- Signing in as a different uid empties the store; items written signed out
  go to whoever signs in.
- Reminders: `mirrorPlannerReminders` (trigger on plannerItems) keeps
  `plannerReminders/{uid}.events` = events that have reminders, so
  `sendReminders` reads one document; a planner still in an old state counts
  too until those apps update.
- No pruning by age any more. Tests: `tests/test-planner-sync.js` (two devices
  through a fake server).

### What a level costs (the level curve)

`SYS.RANK_LEVEL_EXP` is now **[100, 130, 170, 220, 280, 350, 440, 550]** —
raised from [15, 30, 50, 75, 100, 130, 170, 200]. A G-Rank level cost 15 EXP,
so a 1300-point quest was **86 levels** and one long book nearly cleared a
whole rank; the user saw exactly that ("level 6 then suddenly 68"). Now 1300
is about 13 levels and crossing G-Rank takes 10,000 EXP. G→S is 224,000 EXP,
up from 77,000.

**Trait growth did not change.** Points are per 100 EXP
(`RANK_POINTS_PER_100_EXP`), so dearer levels each award proportionally more.

**One migration, keyed on the curve, not the schema.** `player.curve` says
which array a saved standing was written under: 3 current, 2 the previous
array, 1 the flat-hundred era. `SYS.migrateLevelCurve` re-derives the standing
from the EXP behind it — **EXP and trait levels never move** — and retires the
level history into `trimmedLevels`, because every record in it counts levels
in the old units. The old schema-keyed conversion was folded into this, so
there is no longer a second mechanism that can disagree with it.

**The bug worth remembering:** `normalizeState` merges the default player over
the saved one, and the default carries `curve: 3` — so every old document
looked current and was never converted, while the old schema-1 path quietly
inflated it (4,970 EXP read as 20,920). The saved curve is now read **before**
that merge. A unit test on the migration alone passed throughout; only the
end-to-end check caught it, so re-run that when touching this: write a state
with an old standing into `localStorage`, reload, and compare
`SYS.totalExp(player)` before and after.

**Both copies of the curve must match** — `js/constants.js` and
`functions/index.js` — which is what `tests/test-curve.js` compares as text,
because in session 7 they disagreed and the app "corrected" its own standing
on every load.

### When a task may be recorded as done (verification plan, phase 4, step A)

`functions/effort.js` is the pure half, tested in `tests/test-effort.js`;
**nothing calls it yet**, so the app is unchanged. The rule: a day holds at
most `DAILY_CAP_HOURS` (14) of effort, and no stretch of time holds more
effort than it has hours.

- `unlockAt(openedAt, hours, minDays, charged)` walks day by day — each day
  has a different amount left, so there is no single rate to divide by — and
  returns the later of the hours answer and `openedAt + minDays`.
- `availableHours` is what a caller asks before allowing a completion.
- `chargeFor(effortHours, share)` — a quest pays for the share just finished,
  a habit for one repeat, and **never less than `MIN_CHARGE_HOURS`** (2
  minutes). That minimum is the thing that makes the cap bite at all on
  trivial habits, which consume no hours: fifty of them fill under two hours.
- `spend` fills the **earliest** day first (a past day's capacity can never be
  used by a later task, so spending it first leaves the most room), and
  returns `{ days, unplaced }`. **A caller that gets `unplaced > 0` must
  refuse the completion.** The first version dumped the remainder on the
  reported day instead, which let thirty one-hour completions charge one day
  thirty hours — the cap did nothing, and a test written for exactly that
  caught it. `refund` is its mirror, latest day first.

Timestamps arrive as `{dayKey, minutes}` (via `REMINDERS.localParts`), so the
module holds no opinion about timezones. The agreed worked example is asserted
verbatim: 20 hours added at 18:00 on a day already holding 4 unlocks
**tomorrow 14:00**, and a 3-hour task finished tomorrow pushes it to **03:00
the day after**. If either number changes, the rule the feature was explained
with has changed.

### The unlock time, wired in (phase 4, step B)

`recordProgress` now refuses work that could not have been done, **before any
EXP is written**, so a refusal pays nothing:
- The price's `createdAt` is when a quest opened; a habit repeat opens at its
  own day's midnight. Both become `{dayKey, minutes}` through `localStamp`.
- `deltaHours` is what this report costs — a quest's share minus what it has
  already been charged (`hoursCharged` on the progress ledger), a habit's one
  repeat — and never less than `MIN_CHARGE_HOURS` when EXP is earned.
- Refuses `locked` (not yet possible) or `day-full` (`spend` handed hours
  back), returning the unlock moment with the refusal. Undo refunds the hours.
- `minDays` applies to the share claimed: half of a thirty-day challenge needs
  fifteen days.

`unlockTimes` (callable) answers with `{ locked, day, minutes }` per priceId —
**the moment only, never the hours**, since the hours would tell somebody
exactly what to claim. The app stores them in `ui.unlocks`, refreshes on the
quests/habits/overview pages and after any refusal, greys out the controls
that would add progress (never the ones that take it away), and shows
"Opens tomorrow at 14:00" on the card. `refuseLocked` in main.js says the same
thing as a toast if a control is reached anyway; the server is still the one
that decides.

**Ledger:** `effortLedger/{uid}` = `{ days: { "YYYY-MM-DD": hours } }`,
server-only, documented in `firestore.rules` with no match block.

**Reading a standing back** (a number that moves for no visible reason is the
failure this design exists to prevent, so every movement says why):
- `[journal] uid ±delta server|unverified <source> | baseline … journal …
  unverified … total …` — one line per EXP movement, from `recordExpEvent`.
- `[progress] uid <kind> <priceId6> <day done|cleared|at N%> -> ok|refused
  (reason) delta N | today <key>` — one line per report, from `recordProgress`.
The app also warns in its own console — `[TheSystem] correcting local EXP by
N to match the journal` — when it puts its EXP back to the journal's figure.
That is the one moment a standing can move a long way without anybody doing
anything, and it leaves no server-side trace.

`firebase functions:log --only <name>` hides stdout; `--json` shows it but has
been seen to fail outright with "Failed to retrieve log entries", and `gcloud`
is not installed here — so when the JSON path is down, the plain output only
proves *that* a function ran, not what it logged.

**A named trait decides its own category too.** `allocatePoints` takes the
category weights from whatever it is handed, and `applyExpDelta` used to hand
it `compositionSnapshot` — the pool of unconverted EXP attribution, drawn
down proportionally across *every* category in it by `consumeComposition`. So
a Bodily task's points landed in Naturalist and Visual (on those categories'
weakest traits, since the delta named no trait there) while the task row read
`BUILDS Handcrafts`. Reported from a real screenshot: three `STAT INVESTED`
toasts, none of them Handcrafts. `namesATrait` only overrode the trait *within*
a category, which is why the comment above the function claimed a behaviour
the code did not have. Now a delta that names traits is allocated from
`deltaCategoryWeights` + `deltaTargets`; work that names nothing still follows
the pool, which is its only signal. The EXP attribution is consumed exactly as
before, so `levelHistory` reverses a level unchanged — the undo tests in
`tests/test-awards.js` cover that, and `3c` covers the fix itself.

**One movement, one log line.** `applyExpDelta` writes a single
`Level <from> → <to>` entry for the whole span, with the points totalled per
trait, and a single `Level <from> → <to> (reverted)` when EXP is taken back —
not one row per level crossed (900 EXP at G-Rank crosses sixty-two). Rank-up
and rank-down keep their own lines, which is what explains the level numbers
restarting at 1 inside a span. Tested in `tests/test-awards.js`.

**At launch, with the wipe of test progress:** set `COUNT_UNVERIFIED_EXP` in
`functions/index.js` to `false` and change the `expEvents` create rule to
`false`. From then on only server-computed EXP counts.

## Closed 2026-10-02: only the server moves a public standing

Two doors were still open, both now shut and deployed (functions + rules):

1. **Device-written journal entries.** The `expEvents` create rule allowed any
   signed-in device to append deltas up to ±100000, unlimited, and
   `COUNT_UNVERIFIED_EXP` was true, so they counted publicly. Now the rule is
   `allow create: if false`, the flag is false, and the client queues only
   priced *reports* (`onExpDelta` drops unpriced deltas; `appendExpEvents` is
   deleted; the flush discards any plain delta an old version queued). EXP
   reaches the journal only via `recordProgress` and `applyAdjustment`.
   What earlier unverified entries added stays counted.
2. **Grandfathered baselines.** `writeLeaderboardEntry` seeded `expTotals.baseline`
   from the client's own player the first time a row was written, so a new
   account could edit its EXP, claim a name, and keep it for ever (the test
   shows a forged S Lv100 starting at 223,649). `ensureBaseline(uid)` now
   always seeds 0; every pre-journal account already had its baseline.

`tests/test-journal-trust.js` loads the real `functions/index.js` against an
in-memory Firestore (stubbed firebase-functions/admin) and fails 5 of 7 on
the old code. Reuse that harness for any future trigger test.

**Consequence he accepted:** his admin account's old unpriced tasks (Animal
Farm etc.) no longer earn EXP; the local figure is reconciled back to the
journal. He plans to wipe that account's progress anyway.

**Still client-owned:** `questsCompleted` on the board (cosmetic, does not
order anything). A natural next step is counting quests the server paid to
completion in `progressLedger`.

## AI spend limits (2026-10-02)

Measured: one evaluateTask is ~4.2K cached system + ~0.8K uncached (the
91-trait list ~535) + ~100 out on claude-sonnet-5: ~$0.013 cold, ~$0.0035
warm. Per account a month: light ~$0.25, active ~$1. Four paths share one
quota (evaluateTask, suggestQuests, a library cache miss, submitReflection);
bio moderation is Haiku with its own cap.

- `MAX_EVALUATIONS_PER_DAY` 20 -> **10** at his word (ceiling ~$4/account/month).
- **Global breaker:** `GLOBAL_MAX_EVALUATIONS_PER_DAY` 200 in ai-config.js,
  counted in `aiBudget/{UTC day}` inside the same transaction as the
  per-account count; trips with a `[ai-budget]` warn line. Refusals carry
  `details.code` `ai-user-limit` / `ai-global-limit`, translated by
  `aiLimitText` in main.js (task form and library). Tested in
  `tests/test-journal-trust.js`.
- **The breaker is for the free period only.** He asked why it exists when
  AI will sit behind a subscription. Agreed: once the subscription exists,
  **paying accounts must be exempt from the global cap** (a tripped breaker
  refusing paying users is the worst outcome), or it goes entirely if no
  free AI remains. Keep the per-account cap: a subscriber maxing 10/day
  costs ~$4/month, so the price must sit above that.
- **App Check, 2026-10-02: tokens on, NOT enforced yet.** reCAPTCHA Enterprise
  (Google calls it Fraud Defense now) key `6LdKI9stAAAAAJtg9q7rhamFs5R4cykpSuZ9_sPo`,
  domains osama1716.github.io + localhost, registered in Firebase App Check
  (Apps tab shows Registered). `cloud.js` uses `ReCaptchaEnterpriseProvider` and
  sets the debug token on localhost (register it under Manage debug tokens to
  test locally once enforced). `noteAppCheck` logs `[appcheck] <fn> <uid6>
  verified|missing` on recordProgress and evaluateTask. **Next:** after a day
  of real use, if every call from the app says verified, add
  `enforceAppCheck: true` to the onCall options (all callables) and enforce
  Firestore in the console. Then file:// stops reaching the backend, accepted.
- **Was open:** App Check was `PASTE_ME`, so scripts could call the functions;
  the breaker bounds the bill, App Check would stop it at the door.

## Known limitation (accepted, documented) — historical, see above


`users/{uid}`'s `player.exp`/`level` are still written by the client's
normal sync, so a technically savvy user could inflate their own stats via
devtools. What *is* guaranteed is that nothing is self-*priced* any more —
every value comes from the AI or an admin. **Since phase 2 (above) that
number is corrected back to the journal on every load, and the journal only
pays what the server computes for priced tasks.**

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

- **Firestore refuses a whole document over one nested array, and the compat
  SDK refuses it by throwing.** `levelHistory` records listed awarded points as
  `[type, traitId]` pairs, so from the first level gained no save of the
  account landed — for a long time, silently, because `set()` threw inside the
  debounce timer where nothing caught it. It surfaced as "reminders never
  arrive": the scheduler's copy of the account had no reminder times. Awards
  are `{ type, traitId }` now (`awardOf` reads both; `migrateAwardedTraits`
  rewrites pairs on load); `cloud.js` JSON round-trips the state (drops
  `undefined`) and turns a synchronous throw into a reported failure;
  `tests/test-nested.js` walks the state for arrays in arrays. **Never store an
  array directly inside another array in anything that syncs.**
- **The state document has a 1 MiB ceiling, and `levelHistory` is what grows.**
  About 1.7 KB per level: at ~450–500 levels the document passes 1 MiB and every
  save is refused again (now visibly, and reported through
  `reportSaveFailure`). Most of each record is the per-category remainder
  snapshot and the composition snapshots, all 17-digit floats keyed by trait
  name. Records now keep only the categories a level changed — proven identical
  to the full snapshot over 15,000 random gains and undos — but a level usually
  touches six of eight, so that saved ~10%. **The bound, chosen by the user:
  only the newest `SYS.LEVEL_HISTORY_KEEP` (150) records are kept** — ~340 KB
  at most, 356 KB for the whole state at S-100 (was 1.37 MB). Undo is exact
  within those 150 levels (30,000 EXP at S-rank). Past them
  `player.trimmedLevels` lets a level still be taken back at its rank's price,
  landing on the same standing and total, but its trait points stay, because
  which trait they went to was trimmed. An account never trimmed floors exactly
  as before. The other option — the history in its own documents, exact
  forever — was declined as too large a change to sync. `trimLevelHistory` runs
  after every gain and on load; `tests/test-history-cap.js` holds all of this.

- **A second `function foo()` in the same file silently replaces the first.**
  A new helper named `daysBetween` overwrote the engine's own (a signed
  difference three schedule shapes depend on); the only symptom was interval
  habits becoming due on the wrong days. The static audit now refuses any
  function name declared twice in one file.
- **Don't guard an export with `SYS.x && SYS.x(...)`.** It silently falls back
  when the export is missing — which it was — and hides the very bug it looks
  like it prevents.
- **Day keys are local.** `toISOString().slice(0, 10)` is UTC; at 01:00 in a
  UTC+3 zone it is still yesterday. Use `SYS.todayKey()` / `SYS.dateKey()`.
- **Anything in `normalizeState` that writes must set `rep.migrated`**, or the
  result is recomputed on every load and never saved.
- **Measure colours, don't eyeball them.** The dataviz validator only takes
  opaque `#rrggbb`, so flatten `rgba` tokens onto the real card surface first;
  and it exits 1 whenever any check fails — including the categorical-only
  ones that always fail for an intentional gray. Read its report, not its
  exit code.
- **Don't put chart text inside a scaled SVG.** A fixed `viewBox` stretched to
  its card scales the text with it: axis labels sized for a phone came out
  about six times too large on a desktop, and the user saw it on first look.
  The Comparison chart is HTML — the bars stretch, the type keeps its size, and
  the plot scrolls sideways inside the card when every label cannot fit.
- **The Browser pane can be hidden** (`document.visibilityState === "hidden"`).
  Screenshots then come back blank or half-painted, and `focus()` moves focus
  without firing focus events. DOM geometry checks still work — trust those.

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
- **Tests live in `tests/`; run `node tests/run.js` before every push.** Each
  `test-*.js` loads `js/constants.js` and `js/engine.js` into a `vm` context
  (or requires a `functions/` file) and runs with plain `node`; `tests/audit/`
  holds the static audit, the randomised invariants and the button-label check.
  Paths resolve from `__dirname`, so they run from any checkout. A file fails
  the run if it exits non-zero or its last line reports a failure. Add a test
  next to the feature rather than in a scratchpad, where it would be lost.
- Commit messages explain *why*, not just what.
