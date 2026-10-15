# The System — standing instructions for Claude

Read this before every task. It holds what the owner keeps having to repeat.

## Talking to him
- Write every reply in **Levantine Arabic** (عامية شامية). Never switch to English, even for one paragraph.
- Text **inside the app** in Arabic is Modern Standard Arabic (فصحى), never Levantine. All seven languages
  (en, ar, es, fr, de, ja, zh) get every new string; `tests/test-i18n.js` checks it.
- Never tell him the service-worker cache number (v56…). Say "it's live".
- He is not a developer. Give him exact clicks or exact commands; do console/CLI work yourself when you can.
- Unclear request: ask one short question with options instead of guessing. Two failed tries at the same
  thing: stop and ask what is wrong before a third.

## Verifying (do it yourself, never ask him to check)
- "Done" means seen working in a real Chrome: drive it over the DevTools socket (see `tests/lib-chrome.js`),
  take screenshots, and read them. The Claude browser pane freezes animations: never judge motion there.
- Check every page you touched in English, Arabic (RTL) and on a phone width (390px), not only the one in
  the screenshot he sent.
- A new test is only trusted after a mutation check: break the thing on purpose, see the test fail, restore.
- Run `node scripts/build.js` then `node tests/run.js` before every commit. The page loads `app.min.js` and
  `app.min.css`, not `js/` or `styles.css`, so an unbuilt change is invisible.
- Before saying a bug is fixed, reproduce it first. If you cannot reproduce it, say so plainly.

## Shipping
- Front end goes live only with `git push origin main` (GitHub Pages). Functions deploy separately:
  `firebase deploy --only functions --project the-system-44ff7`.
- Try risky work on **staging** first: project `the-system-staging-efdc1` (alias `staging`),
  site https://the-system-staging-efdc1.web.app. The page uses staging only on that host or on localhost
  with `?backend=staging` (`js/firebase-config.js`, pinned by `tests/test-backend-choice.js`).
- Rules: `node tests/test-rules.js` runs them in the local Firestore emulator (needs Java, installed).
- Never type, paste or store a real secret, password or API key. Staging's AI and push secrets are placeholders.
- Commits need `-c user.name="Osama" -c user.email="osamaghanem129@gmail.com"` (no global git identity).

## Design rules (settled; do not reopen)
- One look: Solo Leveling "System windows" — sharp navy panels, bright cyan rim + faint inner rim, corner
  notches, a centred capitalised title tag between two rules. Blue for the interface; gold and colour only for
  what is earned (Coreon coin, rank emblems, podium).
- Art only for what you earn, CSS for what you use. One title per page. No explanatory prose in the app
  (help lives behind the "?" and in the guided tours).
- The page title stays exactly centred; the "?" stands beside the title tag, outside it, off the rules.
- Hover on a link-like name or emblem changes its colour or brightness; never an underline.
- No sound effects. Motion: windows arrive with a short unfold, never restart on a redraw, and end on the
  plain style (`tests/test-ui-blue.js` guards this).
- When a feature adds or changes a button, add it to the guided tour (`js/tour.js`, `tour.<page>.<k>` strings)
  and the in-app guide.

## Editing gotchas
- Many files are CRLF and some LF: edit through a script that normalises line endings, or the Edit tool.
- Long heredocs with apostrophes break the shell: write the script to a file with the Write tool, then run it.
- `js/trial-demo.js` (`?uitest&demo`) is trial-only and must leave `js/load-order.json` before merging.
