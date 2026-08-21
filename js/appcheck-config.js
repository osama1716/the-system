// Firebase App Check site key (reCAPTCHA v3) — stops random bots/scripts from
// hitting your Auth/Firestore using the public apiKey in firebase-config.js,
// without affecting real users of this app in a browser.
// Get it from Firebase console -> Build -> App Check -> register this web
// app -> provider "reCAPTCHA v3" -> copy the site key it gives you here.
// Same as firebase-config.js: safe to be public/committed, and everything
// no-ops gracefully if this is left as the placeholder.
window.FIREBASE_APPCHECK_SITE_KEY = "PASTE_ME";
