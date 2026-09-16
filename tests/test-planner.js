// The planner's day list, against the shipped code. Dates are fixed.
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..").split(path.sep).join("/") + "/";
const SYS = {};
let n = 0;
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + (++n) } };
vm.createContext(sb);
for (const f of ["constants.js", "engine.js", "planner.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}
let fails = 0;
const check = (name, c, d) => { if (!c) { fails++; console.log("  FAIL  " + name + (d ? "  " + d : "")); } else console.log("  ok    " + name); };

const MON = "2026-09-14", TUE = "2026-09-15", WED = "2026-09-16";
const fresh = () => { const s = {}; SYS.normalizePlanner(s, WED); return s; };

console.log("");
console.log("adding and listing");
{
  const s = fresh();
  check("an empty title is refused", SYS.addTodo(s, { title: "   ", day: WED, today: WED }) === null);
  check("a bad day is refused", SYS.addTodo(s, { title: "x", day: "tomorrow", today: WED }) === null);
  const a = SYS.addTodo(s, { title: "  call   the bank ", day: WED, today: WED, now: 1 });
  const b = SYS.addTodo(s, { title: "buy milk", day: WED, today: WED, now: 2 });
  SYS.addTodo(s, { title: "other day", day: TUE, today: WED, now: 3 });
  check("whitespace is tidied", a.title === "call the bank", a.title);
  check("a long title is cut", SYS.addTodo(s, { title: "y".repeat(500), day: WED, today: WED }).title.length === SYS.PLANNER_TITLE_MAX);
  SYS.toggleTodo(s, a.id, 10);
  const list = SYS.todosOn(s, WED).map((x) => x.title);
  check("open items come before finished ones", list[0] === "buy milk" && list[list.length - 1] === "call the bank", JSON.stringify(list));
  check("only that day's items", SYS.todosOn(s, WED).every((x) => x.day === WED));
  SYS.toggleTodo(s, a.id);
  check("unticking clears the time", !a.done && a.doneAt === null);
  check("rename keeps the item", SYS.renameTodo(s, b.id, "buy oat milk").title === "buy oat milk");
  check("rename to nothing is refused", SYS.renameTodo(s, b.id, "  ") === null && b.title === "buy oat milk");
  check("delete removes it", SYS.deleteTodo(s, b.id) && !SYS.todosOn(s, WED).some((x) => x.id === b.id));
}

console.log("");
console.log("the morning question");
{
  const s = fresh();
  const left = SYS.addTodo(s, { title: "left over", day: MON, today: MON, now: 1 });
  const done = SYS.addTodo(s, { title: "finished", day: MON, today: MON, now: 2 });
  const stay = SYS.addTodo(s, { title: "stays put", day: TUE, today: TUE, now: 3 });
  const today = SYS.addTodo(s, { title: "today's", day: WED, today: WED, now: 4 });
  SYS.toggleTodo(s, done.id);
  const pending = SYS.pendingCarry(s, WED).map((x) => x.id);
  check("unfinished past items are asked about", pending.length === 2 && pending[0] === left.id && pending[1] === stay.id, JSON.stringify(pending));
  check("finished and today's items are not", !pending.includes(done.id) && !pending.includes(today.id));

  const backfilled = SYS.addTodo(s, { title: "written onto yesterday", day: TUE, today: WED });
  check("an item written onto a past day is not asked about", !SYS.pendingCarry(s, WED).some((x) => x.id === backfilled.id));

  const moved = SYS.carryTodos(s, [left.id], WED);
  check("only the chosen one moves", moved === 1 && left.day === WED && stay.day === TUE);
  check("it remembers where it came from", left.from === MON);
  check("nothing is asked twice the same morning", SYS.pendingCarry(s, WED).length === 0);
  check("the one left behind is not asked about again", SYS.pendingCarry(s, "2026-09-17").every((x) => x.id !== stay.id));
  const again = SYS.pendingCarry(s, "2026-09-17").map((x) => x.id);
  check("a moved item left unfinished again is asked about again", again.includes(left.id) && again.includes(today.id), JSON.stringify(again));
  SYS.carryTodos(s, [left.id], "2026-09-17");
  check("moving twice keeps the first day", left.from === MON && left.day === "2026-09-17");
  SYS.toggleTodo(s, done.id);
  check("unticking an old finished item brings the question back", SYS.pendingCarry(s, "2026-09-17").some((x) => x.id === done.id));
}

console.log("");
console.log("normalising");
{
  const s = { planner: { todos: [
    { id: "a", title: "ok", day: WED, createdAt: 1 },
    { id: "a", title: "duplicate id", day: WED },
    { id: "b", title: "", day: WED },
    { id: "c", title: "no day" },
    { id: "d", title: "ancient", day: "2025-01-01" },
    null, "junk",
    { id: "e", title: "kept", day: TUE, done: true, doneAt: 5, extra: "dropped" },
  ] } };
  SYS.normalizePlanner(s, WED);
  const ids = s.planner.todos.map((x) => x.id);
  check("junk, blanks, duplicates and old days are dropped", JSON.stringify(ids) === JSON.stringify(["a", "e"]), JSON.stringify(ids));
  check("unknown fields are dropped", !("extra" in s.planner.todos[1]));
  const once = JSON.stringify(s);
  SYS.normalizePlanner(s, WED);
  check("idempotent", JSON.stringify(s) === once);
  const none = {};
  SYS.normalizePlanner(none, WED);
  check("a state without a planner gets an empty one", Array.isArray(none.planner.todos) && none.planner.todos.length === 0);

  const big = { planner: { todos: [] } };
  for (let i = 0; i < 1600; i++) big.planner.todos.push({ id: "t" + i, title: "x", day: i < 100 ? MON : WED, createdAt: i });
  SYS.normalizePlanner(big, WED);
  check("the cap drops the oldest days first", big.planner.todos.length === 1500 && big.planner.todos.every((x) => x.day === WED), big.planner.todos.length);
}

console.log("");
console.log(fails ? fails + " FAIL" : "all passed");
process.exit(fails ? 1 : 0);
