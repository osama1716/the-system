// Persistence: localStorage (works fully offline, no server/backend needed).
(function (SYS) {
  "use strict";

  // The journal queue is kept under its own key, deliberately outside the
  // saved state. State is pushed wholesale to Firestore and its allowed keys
  // are pinned by the security rules, so a queue living inside it would both
  // be rejected and be synced between devices — where it would be uploaded
  // twice. This is per-device outbox, not shared data.
  const EXP_QUEUE_KEY = "the-system:exp-queue";
  // Bounded so a long offline stretch can't grow it without limit; the oldest
  // entries are the ones dropped, since the recent ones matter more to a
  // standing that is about to be recomputed anyway.
  const EXP_QUEUE_MAX = 2000;

  SYS.Storage = {
    loadExpQueue() {
      try {
        const raw = window.localStorage.getItem(EXP_QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    },

    saveExpQueue(list) {
      try {
        const trimmed = Array.isArray(list) ? list.slice(-EXP_QUEUE_MAX) : [];
        window.localStorage.setItem(EXP_QUEUE_KEY, JSON.stringify(trimmed));
        return true;
      } catch (e) {
        console.warn("[TheSystem] couldn't save the exp journal queue.", e);
        return false;
      }
    },

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
