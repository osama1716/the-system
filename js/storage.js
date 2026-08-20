// Persistence: localStorage (works fully offline, no server/backend needed).
(function (SYS) {
  "use strict";

  SYS.Storage = {
    load() {
      try {
        const raw = window.localStorage.getItem(SYS.STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed;
      } catch (e) {
        console.warn("[TheSystem] failed to load saved state, starting fresh.", e);
        return null;
      }
    },

    save(state) {
      try {
        window.localStorage.setItem(SYS.STORAGE_KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        console.warn("[TheSystem] failed to save state (storage full or unavailable).", e);
        return false;
      }
    },

    exportToFile(state) {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `the-system-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },

    importFromFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(reader.result);
            if (!parsed || typeof parsed !== "object" || !parsed.player || !parsed.intelligences) {
              reject(new Error("That file doesn't look like a System backup."));
              return;
            }
            resolve(parsed);
          } catch (e) {
            reject(new Error("Couldn't parse that file as JSON."));
          }
        };
        reader.onerror = () => reject(new Error("Couldn't read that file."));
        reader.readAsText(file);
      });
    },
  };
})(window.SYS = window.SYS || {});
