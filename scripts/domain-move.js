// The code side of moving The System to its own domain, in one go:
//
//   node scripts/domain-move.js thesystemhq.com          make the changes
//   node scripts/domain-move.js thesystemhq.com --dry    only list them
//
// Run it once the domain is bought and connected to Firebase Hosting — the
// console steps around it, in order, are in DOMAIN-MOVE.md. Safe to run twice:
// every change checks whether it is already there.
//
// What it changes:
//   - js/firebase-config.js  authDomain → the domain, so Google sign-in names
//     the domain instead of the-system-44ff7.firebaseapp.com (works because
//     Firebase Hosting serves /__/auth/* on a connected domain);
//   - index.html  the sign-in frame may come from the page's own origin, and
//     the page gets its description, canonical address, link-preview tags and
//     structured data for search;
//   - robots.txt and sitemap.xml, new;
//   - docs/index.html, docs/404.html  the old address's redirect page;
//   - functions/index.js  the push sender's contact address.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const domain = (process.argv[2] || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const dry = process.argv.includes("--dry");
if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
  console.error("usage: node scripts/domain-move.js <domain> [--dry]   e.g. thesystemhq.com");
  process.exit(2);
}
const SITE = "https://" + domain + "/";
const DESCRIPTION = "Level up your real life. The System turns your goals and habits into an RPG: an AI values every task by the real effort it takes, so every level and rank you reach is earned.";

const done = [];
function edit(rel, fn) {
  const p = path.join(ROOT, rel);
  const before = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  const after = fn(before);
  if (after == null || after === before) return;
  done.push(rel + (before == null ? " (new)" : ""));
  if (!dry) fs.writeFileSync(p, after);
}

edit("js/firebase-config.js", (s) => s.replace(/authDomain: "[^"]*"/, 'authDomain: "' + domain + '"'));

edit("index.html", (s) => {
  // The sign-in iframe now comes from this origin, not *.firebaseapp.com.
  s = s.replace(/frame-src (?!'self')/, "frame-src 'self' ");
  if (s.includes('rel="canonical"')) return s;
  const head = [
    '<meta name="description" content="' + DESCRIPTION + '" />',
    '<link rel="canonical" href="' + SITE + '" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="The System" />',
    '<meta property="og:title" content="The System — level up your real life" />',
    '<meta property="og:description" content="' + DESCRIPTION + '" />',
    '<meta property="og:url" content="' + SITE + '" />',
    '<meta property="og:image" content="' + SITE + 'icons/icon-512-v2.png" />',
    '<meta name="twitter:card" content="summary" />',
    // A data block, not a script: the Content-Security-Policy does not run it.
    '<script type="application/ld+json">' + JSON.stringify({
      "@context": "https://schema.org", "@type": "WebApplication", name: "The System", url: SITE,
      applicationCategory: "LifestyleApplication", operatingSystem: "Any", description: DESCRIPTION,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    }) + "</script>",
  ].join("\n");
  return s.replace("<title>The System</title>", "<title>The System</title>\n" + head);
});

edit("robots.txt", () => "User-agent: *\nAllow: /\n\nSitemap: " + SITE + "sitemap.xml\n");
edit("sitemap.xml", () => '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' + SITE + "</loc></url>\n</urlset>\n");

// The old address's page, served once GitHub Pages is switched to /docs.
// Written from scripts/old-address-redirect.html, the domain filled in.
const redirectPage = fs.readFileSync(path.join(ROOT, "scripts", "old-address-redirect.html"), "utf8").replace(/NEW_DOMAIN/g, domain);
if (!dry) fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
["docs/index.html", "docs/404.html"].forEach((rel) => edit(rel, () => redirectPage));

edit("functions/index.js", (s) => s.replace(/const VAPID_SUBJECT = "[^"]*";/, 'const VAPID_SUBJECT = "' + SITE + '";'));

console.log((dry ? "would change: " : "changed: ") + (done.length ? done.join(", ") : "nothing — already moved"));
if (!dry && done.length) {
  console.log("next: node scripts/build.js, run the tests, then deploy hosting and functions (DOMAIN-MOVE.md, step 6)");
}
