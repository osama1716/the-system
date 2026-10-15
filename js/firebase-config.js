// Paste your Firebase project's config here (Firebase console → Project
// settings → scroll to "Your apps" → the web app → SDK setup and config).
// This is safe to be public/committed — Firebase's actual security comes
// from the Firestore rules (see README), not from hiding this object.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyB7IKZh_dH9UFsvMyS3ajWL8sfE-F8rlvc",
  authDomain: "the-system-44ff7.firebaseapp.com",
  projectId: "the-system-44ff7",
  storageBucket: "the-system-44ff7.firebasestorage.app",
  messagingSenderId: "2607555971",
  appId: "1:2607555971:web:63f1c57d3d7d81b897c2b6",
};

// The staging project (a second, empty copy of the backend, for trying risky
// changes — rules, functions — before the live one). Chosen by where the page
// is served from, never by a setting a person could flip: the staging site
// itself, or this machine with ?backend=staging. Everywhere else stays live.
(function () {
  var h = location.hostname;
  var onStagingSite = /^the-system-staging-efdc1\.(web\.app|firebaseapp\.com)$/.test(h);
  var asked = /^(localhost|127\.0\.0\.1)$/.test(h) && /[?&]backend=staging(&|$)/.test(location.search);
  if (!onStagingSite && !asked) return;
  window.FIREBASE_STAGING = true;
  window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyBHjZtDlS-Hw8fh5R7finBVHgbBKR0_AP4",
    authDomain: "the-system-staging-efdc1.firebaseapp.com",
    projectId: "the-system-staging-efdc1",
    storageBucket: "the-system-staging-efdc1.firebasestorage.app",
    messagingSenderId: "650843079722",
    appId: "1:650843079722:web:1683e9b0fc37c25780ef53",
  };
})();
