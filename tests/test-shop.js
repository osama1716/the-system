// Gold, Aurenite and the shop (functions/shop.js), and the streak freezes
// they buy (functions/streak.js).
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..");
const SHOP = require(path.join(REPO, "functions", "shop.js"));
const STREAK = require(path.join(REPO, "functions", "streak.js"));
const SYS = {};
const sb = { SYS, window: {}, console, Math, JSON, Object, Array, Number, String, Boolean, RegExp, Date, Set, Map, Intl,
  crypto: { randomUUID: () => "id" + Math.random() } };
vm.createContext(sb);
for (const f of ["constants.js", "engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", f), "utf8")
    .replace(/\}\)\(window\.SYS[^)]*\);?\s*$/, "})(SYS);"), sb, { filename: f });
}

let fails = 0;
const check = (n, c, d) => { if (!c) { fails++; console.log("  FAIL  " + n + (d ? "  " + d : "")); } else console.log("  ok    " + n); };

console.log("the app and the server price the same things");
{
  check("gold per EXP", SYS.SHOP.goldPerExp === SHOP.GOLD_PER_EXP);
  check("the free theme", SYS.SHOP.freeTheme === SHOP.FREE_THEME);
  check("theme prices", JSON.stringify(SYS.SHOP.themePrices) === JSON.stringify(SHOP.THEME_PRICES));
  check("freeze price and cap", SYS.SHOP.freezePrice === SHOP.FREEZE_PRICE && SYS.SHOP.freezeMax === SHOP.FREEZE_MAX);
  check("frame prices", JSON.stringify(SYS.SHOP.framePrices) === JSON.stringify(SHOP.FRAME_PRICES));
  const names = Object.keys(SYS.THEMES).sort();
  const sold = [SHOP.FREE_THEME].concat(Object.keys(SHOP.THEME_PRICES)).sort();
  check("every theme is either free or for sale, and nothing else is", names.join() === sold.join(), names.join(" | "));
  check("only dark themes remain", names.every((n) => SYS.THEMES[n].dark === true));
  check("the default is the free one", SYS.DEFAULT_SETTINGS.theme === SHOP.FREE_THEME);
  check("a theme sells for 10,000 gold", Object.values(SHOP.THEME_PRICES).every((p) => p === 10000));
  check("a frame costs 450 Aurenite", SHOP.FRAME_PRICES.hud === 450);
}

console.log("");
console.log("gold follows the journal");
{
  let w = SHOP.blankWallet(0);
  w = SHOP.onExp(w, 120, 0).wallet;
  check("ten gold per EXP", w.gold === 1200, String(w.gold));
  w = SHOP.onExp(w, -120, 0).wallet;
  check("an undone task takes its gold back", w.gold === 0, String(w.gold));
  const spent = { ...SHOP.onExp(SHOP.blankWallet(0), 100, 0).wallet };
  spent.gold -= 1000; // bought something
  const undone = SHOP.onExp(spent, -100, 0).wallet;
  check("and may go below zero, so do-spend-undo-redo mints nothing", undone.gold === -1000, String(undone.gold));
  const up = SHOP.onExp(SHOP.blankWallet(0), 50, 1);
  check("a new rank pays 30,000", up.rankGold === 30000 && up.wallet.gold === 30500 && up.wallet.rankRewarded === 1, JSON.stringify(up));
  const again = SHOP.onExp({ ...up.wallet }, -50, 0);
  const back = SHOP.onExp(again.wallet, 50, 1);
  check("climbing back into a rank already paid pays nothing more", back.rankGold === 0, String(back.rankGold));
  const late = SHOP.onExp(SHOP.blankWallet(3), 10, 3);
  check("a wallet opened at D-rank is not paid for G to D", late.rankGold === 0);
  check("streak milestones", SHOP.streakGold(6, 7) === 2500 && SHOP.streakGold(29, 30) === 10000 && SHOP.streakGold(99, 100) === 40000 && SHOP.streakGold(7, 7) === 0 && SHOP.streakGold(7, 8) === 0);
}

console.log("");
console.log("buying");
{
  const rich = { ...SHOP.blankWallet(0), gold: 25000 };
  const t1 = SHOP.buy(rich, { kind: "theme", id: "Black & blond" });
  check("a theme for 10,000", t1.ok && t1.wallet.gold === 15000 && t1.wallet.themes.includes("Black & blond"), JSON.stringify(t1));
  check("not twice", SHOP.buy(t1.wallet, { kind: "theme", id: "Black & blond" }).error === "owned");
  check("not the free one", SHOP.buy(rich, { kind: "theme", id: SHOP.FREE_THEME }).error !== undefined && !SHOP.buy(rich, { kind: "theme", id: SHOP.FREE_THEME }).ok);
  check("not without the gold", SHOP.buy({ ...SHOP.blankWallet(0), gold: 9999 }, { kind: "theme", id: "Black & blond" }).error === "gold");
  check("not a theme that does not exist", SHOP.buy(rich, { kind: "theme", id: "White & gold" }).error === "unknown");
  let w = rich;
  w = SHOP.buy(w, { kind: "freeze" }).wallet;
  w = SHOP.buy(w, { kind: "freeze" }).wallet;
  check("two freezes", w.freezes === 2 && w.gold === 15000, JSON.stringify(w));
  check("and no third", SHOP.buy(w, { kind: "freeze" }).error === "full");
  check("frames are not on sale yet", SHOP.buy({ ...rich, aurenite: 1000 }, { kind: "frame", id: "hud" }).error === "soon");
  check("and nothing hands out Aurenite", SHOP.onExp(SHOP.blankWallet(0), 5000, 7).wallet.aurenite === 0);
}

console.log("");
console.log("freezes keep a streak through missed days");
{
  const s = { current: 10, best: 10, lastDay: "2026-10-07" };
  const one = STREAK.advance(s, "2026-10-09", 1);
  check("one missed day, one freeze: carries on and spends it", one.current === 11 && one.used === 1, JSON.stringify(one));
  const none = STREAK.advance(s, "2026-10-09", 0);
  check("no freeze: starts again", none.current === 1 && none.used === 0, JSON.stringify(none));
  const two = STREAK.advance(s, "2026-10-10", 1);
  check("two missed days, one freeze: starts again and spends nothing", two.current === 1 && two.used === 0, JSON.stringify(two));
  check("alive the day after a missed one while a freeze is held", STREAK.live(s, "2026-10-09", 1).current === 10);
  check("ended without one", STREAK.live(s, "2026-10-09", 0).current === 0);
}

console.log("");
console.log("wired in");
{
  const rules = fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8");
  check("only the server writes a wallet", /match \/wallets\/\{userId\} \{\s*allow read: if isOwner\(userId\) \|\| isAdmin\(\);\s*allow write: if false;/.test(rules));
  const index = fs.readFileSync(path.join(REPO, "functions", "index.js"), "utf8");
  check("erasing an account removes it", /const singles = \[[^\]]*"wallets"/.test(index));
  check("the shop's frame art is in place", fs.existsSync(path.join(REPO, "assets", "frames", "aurenite-hud-128.webp")));
  check("ownership: the free theme always, others once bought",
    SYS.ownsTheme(null, SHOP.FREE_THEME) && !SYS.ownsTheme(null, "Black & blond") &&
    SYS.ownsTheme({ themes: ["Black & blond"] }, "Black & blond"));
}

console.log("");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);
