# Moving The System to its own domain

Prepared 2026-10-09, before the domain was bought. Domain chosen:
**thesystemhq.com** (Porkbun, about 11 USD a year). Everything in the code is
ready; what is left are steps in consoles, in this order. Steps marked
**(Osama)** need his account or his card; the rest Claude does.

## Why the site moves to Firebase Hosting (off GitHub Pages)

- Google sign-in can then show **thesystemhq.com** instead of
  `the-system-44ff7.firebaseapp.com` — Firebase Hosting serves the sign-in
  pages (`/__/auth/*`) on a connected domain, which GitHub Pages cannot.
- Real response headers (cache control per file), set in `firebase.json`.
- Same project as the server, no second account.
- Cost: free up to ~10 GB of traffic a month (360 MB a day), then about
  0.15 USD per GB. A new visitor downloads ~6.5 MB once, so roughly the first
  1,500 new users a month are free and each 1,000 after that ~1 USD.

`firebase.json` already has the `hosting` section: it uploads only the built
site (163 files, ~10 MB — no sources, tests, tools or history).

## The steps

1. **Buy the domain (Osama).** Porkbun → thesystemhq.com. Turn on auto-renew.
2. **Connect it (Osama, Claude can guide).** Firebase console → Hosting →
   *Add custom domain* → `thesystemhq.com`, then `www.thesystemhq.com` set to
   redirect to it. Firebase shows DNS records (a TXT to prove ownership, then
   A records); enter them in Porkbun → Domain → DNS. The certificate can take
   up to 24 hours.
3. **Allow the domain everywhere it is checked (Osama's console login):**
   - Firebase console → Authentication → Settings → **Authorized domains**:
     add `thesystemhq.com` and `www.thesystemhq.com`.
   - Google Cloud console → Security → **reCAPTCHA** → the key App Check
     uses (`js/appcheck-config.js`) → Domains: add `thesystemhq.com`.
     **Without this, App Check refuses every request and the app stops.**
   - Google Cloud console → APIs & Services → Credentials → **Browser key**
     (the apiKey in `js/firebase-config.js`) → Application restrictions →
     HTTP referrers: `https://thesystemhq.com/*`,
     `https://www.thesystemhq.com/*`, `http://localhost:*/*` (and, until the
     old address is retired, `https://osama1716.github.io/*`). The key has no
     restriction today; this closes that too.
   - Same page → **OAuth 2.0 Client IDs** → *Web client (auto created by
     Google Service)* → Authorized JavaScript origins: add
     `https://thesystemhq.com`; Authorized redirect URIs: add
     `https://thesystemhq.com/__/auth/handler`.
4. **The code (Claude):** `node scripts/domain-move.js thesystemhq.com`
   (sign-in domain, search and link-preview tags, robots.txt, sitemap.xml,
   the old address's redirect page, the push sender), then
   `node scripts/build.js`, `node tests/run.js`, commit, push.
5. **Deploy (Claude):** `firebase deploy --only hosting` and
   `firebase deploy --only functions` (the push sender changed).
   Never a bare `firebase deploy` — it deploys rules and everything else too.
6. **Check on the new address (Claude, then Osama on his phone):** the page
   loads with no console errors; App Check passes (no 403s); Google sign-in
   shows thesystemhq.com; the account's data is there; a reminder can be
   turned on and arrives; an invite link opens; the assets finish
   downloading (all 150).
7. **Retire the old address (Claude, with Osama's yes):** GitHub repo →
   Settings → Pages → source *main / docs*. GitHub then serves `docs/`,
   which sends every visit, invite links included, to the new domain.
8. **Search (Osama, Claude can guide):** Google Search Console → add the
   domain (a DNS TXT record in Porkbun) → submit `sitemap.xml`.
9. **Emails from the domain (Osama's console + Porkbun):** Firebase console →
   Authentication → Templates → *Customize domain* → `thesystemhq.com`, add
   the DNS records it shows. Sign-up and password emails then come from
   `noreply@thesystemhq.com` instead of firebaseapp.com (which lands in spam).

## What people notice after the move

- They sign in once more on the new address. Their data is on the server, so
  nothing is lost.
- **Reminders have to be turned on again** — a browser keeps notification
  permission per site.
- Anyone who added the app to their home screen adds it again from the new
  address.

## After the move: the ship routine

Build, test, commit, push — and then `firebase deploy --only hosting`, because
the site no longer comes from GitHub. (A GitHub Action could do the deploy on
every push; it needs a deploy key stored in the repo's secrets, which is
Osama's call.)
