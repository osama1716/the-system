// Friends (functions/friends.js): pair ids, weeks, and what a request becomes.
const path = require("path");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const F = require(REPO + "functions/friends.js");
let fails = 0;
const check = (name, c, d) => { if (!c) { fails++; console.log("  FAIL  " + name + (d ? "  " + d : "")); } else console.log("  ok    " + name); };

console.log("");
console.log("one document per pair");
check("the same id whichever side asks", F.pairId("bob", "alice") === F.pairId("alice", "bob") && F.pairId("alice", "bob") === "alice__bob");

console.log("");
console.log("weeks");
check("a Thursday in week 38", F.weekKeyOf(new Date("2026-09-17T12:00:00Z")) === "2026-W38", F.weekKeyOf(new Date("2026-09-17T12:00:00Z")));
check("Monday starts the week", F.weekKeyOf(new Date("2026-09-14T00:00:00Z")) === "2026-W38" && F.weekKeyOf(new Date("2026-09-13T23:59:59Z")) === "2026-W37");
check("across a year boundary", F.weekKeyOf(new Date("2027-01-01T10:00:00Z")) === "2026-W53", F.weekKeyOf(new Date("2027-01-01T10:00:00Z")));
check("the same week adds up", F.nextWeek({ weekKey: "2026-W38", weekExp: 40 }, "2026-W38", 20).weekExp === 60);
check("a new week starts from the event", JSON.stringify(F.nextWeek({ weekKey: "2026-W37", weekExp: 400 }, "2026-W38", 20)) === JSON.stringify({ weekKey: "2026-W38", weekExp: 20 }));
check("a first event ever", F.nextWeek(null, "2026-W38", 30).weekExp === 30);
check("a loss counts too", F.nextWeek({ weekKey: "2026-W38", weekExp: 30 }, "2026-W38", -20).weekExp === 10);

console.log("");
console.log("what a request becomes");
const d = (over) => F.decideRequest(Object.assign({ me: "a", them: "b", existing: null, blockedBy: false, youBlocked: false, friendCount: 3 }, over));
check("a fresh request", d({}) === "create");
check("not to yourself", d({ them: "a" }) === "self");
check("blocked by them: said so", d({ blockedBy: true }) === "blocked-by");
check("blocked them yourself: unblock first", d({ youBlocked: true }) === "you-blocked");
check("being blocked outranks having blocked", d({ blockedBy: true, youBlocked: true }) === "blocked-by");
check("not twice", d({ existing: { status: "pending", from: "a" } }) === "already-sent");
check("asking someone who asked you is a yes", d({ existing: { status: "pending", from: "b" } }) === "accept");
check("already friends", d({ existing: { status: "accepted", from: "b" } }) === "already-friends");
check("a block outranks an old request", d({ blockedBy: true, existing: { status: "pending", from: "b" } }) === "blocked-by");
check("a full list", d({ friendCount: F.MAX_FRIENDS }) === "full");

console.log("");
console.log("notifications");
check("in the receiver's language", F.message("ar", "request", "أسامة").body === "أسامة يريد أن يصبح صديقك");
check("English when unknown", F.message("xx", "accepted", "Sam").title === "New friend");
check("a race result carries both scores", F.message("en", "raceWon", "Sam", { mine: 120, theirs: 80 }).body === "Against Sam: 120 – 80");
check("and in Arabic", F.message("ar", "raceLost", "سام", { mine: 50, theirs: 90 }).body === "فاز سام: 90 – 50");

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);
