// Firebase App Check site key (reCAPTCHA Enterprise) — stops scripts from
// calling the functions and the database with the public apiKey in
// firebase-config.js, without affecting real users of this app in a browser.
// The key is created in Google Cloud -> Security -> reCAPTCHA (type: website,
// domains osama1716.github.io and localhost) and registered in Firebase
// console -> App Check -> this web app -> reCAPTCHA Enterprise.
// Same as firebase-config.js: safe to be public/committed, and everything
// no-ops gracefully while this is left as the placeholder.
window.FIREBASE_APPCHECK_SITE_KEY = "6LdKI9stAAAAAJtg9q7rhamFs5R4cykpSuZ9_sPo";
