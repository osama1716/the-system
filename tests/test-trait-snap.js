// Snapping the evaluator's answer back onto the person's own trait list.
//
// The model is told to copy a name from the list exactly. When it does not,
// nothing fails loudly: the client cannot match the name, the point lands on
// the weakest trait in that category, and the task card displays the name the
// model gave. The card says one thing and the award does another — the same
// family as the session 5 bug, through a different door. This is the door.
const path = require("path");
const PROMPT = require(path.resolve(__dirname, "..", "functions", "evaluation-prompt.js"));
const snap = PROMPT.snapTraitName;

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

const musical = ["Playing an instrument", "Active listening", "Vocal training", "Musical creativity", "Rhythm & timing", "Music theory", "Ear training", "Recitation & tajweed", "Performing"];
const linguistic = ["Reading", "Writing", "Speaking", "Language learning", "Public speaking", "Storytelling", "Vocabulary & expression", "Listening comprehension", "Debate & argument", "Poetry", "Translation", "Editing & proofreading"];

console.log("");
console.log("an answer already on the list");
check("exact", snap("Vocal training", musical) === "Vocal training");
check("case and punctuation set aside", snap("rhythm and timing", musical) === "Rhythm & timing", snap("rhythm and timing", musical));
check("spacing set aside", snap("EarTraining", musical) === "Ear training", snap("EarTraining", musical));

console.log("");
console.log("an answer the model adapted");
check("one name inside the other", snap("Music theory and harmony", musical) === "Music theory", snap("Music theory and harmony", musical));
check("the other way round", snap("Poetry", linguistic) === "Poetry");
check("words in common win", snap("Public speaking practice", linguistic) === "Public speaking", snap("Public speaking practice", linguistic));

console.log("");
console.log("an answer that is not on the list at all");
check("nothing close is dropped, not guessed", snap("Blacksmithing", musical) === null, String(snap("Blacksmithing", musical)));
check("one shared word is not a match", snap("Reading the weather", ["Writing", "Speaking"]) === null, String(snap("Reading the weather", ["Writing", "Speaking"])));
// The trap this exists for: "Composing" is not "Musical creativity", and
// guessing between them is what put the point on the wrong trait before.
check("a near-miss with no shared word is dropped", snap("Composing", ["Musical creativity", "Ear training"]) === null, String(snap("Composing", ["Musical creativity", "Ear training"])));

console.log("");
console.log("nothing to snap to");
check("no list, no answer", snap("Reading", []) === null);
check("no name, no answer", snap("", linguistic) === null);
check("junk in, null out", snap(null, linguistic) === null && snap("Reading", null) === null);

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);
