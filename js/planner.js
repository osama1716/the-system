// The planner: a plain day list, kept apart from everything that scores.
//
// Nothing in here touches EXP, the ranking or the evaluator, and nothing that
// does reads this. That separation is the point of the section: somebody can
// write "call the bank" without it being priced, judged or counted, and the
// anti-cheat machinery never has to reason about it.
//
// It rides along inside the saved state like everything else, so it syncs
// the same way and needs no collection of its own — but that also means it
// counts against the one document's size, which is why old days are pruned.
(function (SYS) {
  const TITLE_MAX = 200;
  // Six months of days is more than a to-do list is ever looked back at, and
  // it keeps a heavy user's document far below Firestore's limit. The rules
  // refuse a save past TODO_MAX, so the cap here has to stay under it.
  const KEEP_DAYS = 180;
  const TODO_MAX = 1500;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function cleanTitle(title) {
    return String(title == null ? "" : title).replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  }

  function emptyPlanner() { return { todos: [] }; }

  // Idempotent and deterministic for a given day, because it runs on both the
  // local copy and the pulled one before the two are compared.
  function normalizePlanner(state, today) {
    const p = state.planner && typeof state.planner === "object" ? state.planner : emptyPlanner();
    const oldest = SYS.shiftDay(today || SYS.todayKey(), -KEEP_DAYS);
    const seen = new Set();
    const todos = (Array.isArray(p.todos) ? p.todos : [])
      .filter((x) => x && typeof x === "object" && x.id && !seen.has(x.id) && seen.add(x.id))
      .map((x) => ({
        id: String(x.id),
        title: cleanTitle(x.title),
        day: DAY_RE.test(x.day) ? x.day : null,
        done: !!x.done,
        doneAt: x.done && Number(x.doneAt) ? Number(x.doneAt) : null,
        createdAt: Number(x.createdAt) || 0,
        from: DAY_RE.test(x.from) ? x.from : null,
        asked: !!x.asked,
      }))
      .filter((x) => x.title && x.day && x.day >= oldest);
    // Past the cap, the oldest days go first.
    if (todos.length > TODO_MAX) {
      todos.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.createdAt - b.createdAt));
      todos.splice(0, todos.length - TODO_MAX);
    }
    state.planner = { todos };
    return state.planner;
  }
  SYS.normalizePlanner = normalizePlanner;

  function plannerOf(state) {
    if (!state.planner || !Array.isArray(state.planner.todos)) state.planner = emptyPlanner();
    return state.planner;
  }

  // Open items first in the order they were written, then finished ones in
  // the order they were finished — the list reads as what is left.
  function todosOn(state, day) {
    return plannerOf(state).todos
      .filter((x) => x.day === day)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.done) return (a.doneAt || 0) - (b.doneAt || 0);
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  }
  SYS.todosOn = todosOn;

  function addTodo(state, input) {
    const title = cleanTitle(input && input.title);
    const day = input && DAY_RE.test(input.day) ? input.day : null;
    if (!title || !day) return null;
    const today = (input && input.today) || SYS.todayKey();
    const todo = {
      id: (input && input.id) || SYS.uid(),
      title, day, done: false, doneAt: null,
      createdAt: (input && input.now) || Date.now(),
      from: null,
      // Written straight onto a day already over: it is there on purpose, so
      // the next morning should not ask whether to move it.
      asked: day < today,
    };
    plannerOf(state).todos.push(todo);
    return todo;
  }
  SYS.addTodo = addTodo;

  function findTodo(state, id) { return plannerOf(state).todos.find((x) => x.id === id) || null; }

  function toggleTodo(state, id, now) {
    const todo = findTodo(state, id);
    if (!todo) return null;
    todo.done = !todo.done;
    todo.doneAt = todo.done ? (now || Date.now()) : null;
    return todo;
  }
  SYS.toggleTodo = toggleTodo;

  function renameTodo(state, id, title) {
    const todo = findTodo(state, id);
    const clean = cleanTitle(title);
    if (!todo || !clean) return null;
    todo.title = clean;
    return todo;
  }
  SYS.renameTodo = renameTodo;

  function deleteTodo(state, id) {
    const p = plannerOf(state);
    const before = p.todos.length;
    p.todos = p.todos.filter((x) => x.id !== id);
    return p.todos.length !== before;
  }
  SYS.deleteTodo = deleteTodo;

  // What the morning question is about: unfinished items on a day that is
  // over, not yet asked about. Oldest day first.
  function pendingCarry(state, today) {
    const key = today || SYS.todayKey();
    return plannerOf(state).todos
      .filter((x) => !x.done && !x.asked && x.day < key)
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));
  }
  SYS.pendingCarry = pendingCarry;

  // Answers the question for every pending item at once: the chosen ones move
  // to today, the rest stay on their own day and are not asked about again.
  // A moved item keeps the day it was first written for, and is asked about
  // afresh if it is left unfinished again.
  function carryTodos(state, moveIds, today) {
    const key = today || SYS.todayKey();
    const move = new Set(moveIds || []);
    let moved = 0;
    pendingCarry(state, key).forEach((todo) => {
      if (move.has(todo.id)) {
        todo.from = todo.from || todo.day;
        todo.day = key;
        todo.asked = false;
        moved++;
      } else {
        todo.asked = true;
      }
    });
    return moved;
  }
  SYS.carryTodos = carryTodos;

  SYS.PLANNER_TITLE_MAX = TITLE_MAX;
})(window.SYS = window.SYS || {});
