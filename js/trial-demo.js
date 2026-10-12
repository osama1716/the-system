// TRIAL ONLY (never in the real app): /index.html?uitest&demo fills the app
// with sample data so the blue look and the System windows can be tried.
(function () {
  if (!/[?&]demo(&|$)/.test(location.search)) return;
  window.addEventListener("load", () => setTimeout(() => {
    const T = window.SYS && SYS.__uiTest;
    if (!T) return;
    const ui = T.ui, me = "u-demo";
    const st = SYS.clone(T.getState());
    st.player.name = "Osama"; st.player.level = 13; st.player.exp = 62;
    st.tasks = [];
    const q = (title, icon, extra) => SYS.addTask(st, { title, icon, priority: "High", types: ["LING"], pt: 50, taskType: "Short Term", ...extra });
    q("Read 20 pages of a book", "📖"); q("Finish the SDLC assignment", "📝", { taskType: "Long Term", mode: "slider", priority: "Medium" }); q("Clean the room", "🧹", { priority: "Low" });
    const h = (title, icon, unit, targetAmount) => SYS.addTask(st, { title, icon, priority: "Medium", types: ["BODY"], pt: 20, recurring: true, schedule: { type: "daily" }, unit, targetAmount });
    h("Drink water", "💧", "L", 2); h("Deep work session", "🧠", "min", 30); h("Sleep 7–8 hours", "😴", "times", 1); h("Morning workout", "🏋️", "min", 20);
    T.setState(st);
    ui.landing = false; ui.assess = null;
    ["landing-layer", "assess-layer"].forEach((id) => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
    // The landing and the assessment lock the page's scroll while they show.
    document.body.classList.remove("landing-on", "assess-on");
    ui.cloudUser = { uid: me, email: "demo@example.com", emailVerified: true };
    ui.avatars = { [me]: "a08", "u-2": "a03", "u-3": "a11" }; ui.frames = { [me]: "hud" };
    ui.wallet = { gold: 45000, aurenite: 450, themes: [], frames: ["hud"], backgrounds: ["angel"], freezes: 1 };
    ui.myWorn = { frame: "hud" };
    ui.leaderboard = ["Osama", "Kenji", "Seraphina", "Noor", "Maximilian"].map((n, i) => ({ uid: i === 0 ? me : "u-" + (i + 2), displayName: n, totalExp: 12100 - i * 1100, weekExp: 900 - i * 80, seasonExp: 5000 - i * 400, lastRank: i, cats: {} }));
    ui.leaderboardMine = ui.leaderboard[0];
    SYS.applyTheme(T.getState());
    T.render();
  }, 2500));
})();
