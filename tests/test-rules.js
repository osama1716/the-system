// Firestore security rules against the real rules engine:  node tests/test-rules.js
//
// Starts the local Firestore emulator with firestore.rules, runs
// tests/rules-checks.js inside it, and shuts it down. Needs Java (the
// emulator is a Java program) and the Firebase CLI; without either it says so
// and passes, so the other tests still run on a machine that has neither.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const win = process.platform === "win32";

function javaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const spots = win ? ["C:/Program Files/Eclipse Adoptium", "C:/Program Files/Java", "C:/Program Files/Microsoft"] : ["/usr/lib/jvm"];
  for (const dir of spots) {
    if (!fs.existsSync(dir)) continue;
    const jdk = fs.readdirSync(dir).find((n) => /jdk|java|temurin/i.test(n) && fs.existsSync(path.join(dir, n, "bin", win ? "java.exe" : "java")));
    if (jdk) return path.join(dir, jdk);
  }
  return null;
}

const home = javaHome();
const onPath = spawnSync(win ? "where" : "which", ["java"], { encoding: "utf8" }).status === 0;
if (!home && !onPath) { console.log("skipped — Java is not installed (the Firestore emulator needs it)"); process.exit(0); }
const cli = spawnSync(win ? "firebase.cmd" : "firebase", ["--version"], { encoding: "utf8", shell: win });
if (cli.status !== 0) { console.log("skipped — the Firebase CLI is not installed"); process.exit(0); }

const env = { ...process.env };
if (home) { env.JAVA_HOME = home; env.PATH = path.join(home, "bin") + path.delimiter + env.PATH; }
const r = spawnSync(win ? "firebase.cmd" : "firebase",
  ["emulators:exec", "--only", "firestore", "--project", "demo-the-system", win ? "\"node tests/rules-checks.js\"" : "node tests/rules-checks.js"],
  { cwd: ROOT, env, encoding: "utf8", shell: win, timeout: 240000 });
const out = ((r.stdout || "") + (r.stderr || "")).split(/\r?\n/).filter(Boolean);
out.filter((l) => /FAIL|bugs|all passed/.test(l)).forEach((l) => console.log(l));
if (r.status !== 0) {
  if (!out.some((l) => /FAIL|bugs/.test(l))) out.slice(-12).forEach((l) => console.log("  " + l));
  console.log("FAIL  the rules check did not finish cleanly");
  process.exit(1);
}
