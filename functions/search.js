// Finding players by name, forgivingly.
//
// Pure, so tests/test-search.js can hold it. The database cannot search by
// similarity, so the server keeps every claimed name in a small index
// (nameIndex/{shard}: { n: { [key]: { uid, name } } }) and ranks it here:
// the exact name first, then names that start with what was typed, then
// names containing it, then near misses — a typo, or an Arabic name spelt
// with ا for أ, ه for ة, ي for ى.

const SHARDS = 16;
const RESULTS = 20;

// Folded for comparing, never for showing: lower case, compatibility forms,
// no accents or Arabic diacritics and tatweel, and the Arabic letters people
// write interchangeably made one.
function fold(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

function shardOf(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return String(h % SHARDS);
}

// Edit distance where swapping two neighbouring letters is one mistake, not
// two — the commonest typo there is. Stops early once it cannot be within
// `max`.
function distance(a, b, max) {
  const A = [...a], B = [...b];
  if (Math.abs(A.length - B.length) > max) return max + 1;
  let before = null;
  let prev = Array.from({ length: B.length + 1 }, (_, i) => i);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    let best = cur[0];
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      if (before && i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) cur[j] = Math.min(cur[j], before[j - 2] + 1);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    before = prev;
    prev = cur;
  }
  return prev[B.length];
}

// How well `name` answers `query` (both unfolded); 0 is not at all.
function score(query, name) {
  const q = fold(query), n = fold(name);
  if (!q || !n) return 0;
  if (n === q) return 1000;
  if (n.startsWith(q)) return 800 - Math.min(100, [...n].length - [...q].length);
  const words = n.split(" ");
  if (words.some((w) => w.startsWith(q))) return 700;
  const at = n.indexOf(q);
  if (at >= 0) return 600 - Math.min(100, at);
  // Near misses: against the whole name, and against its start at the
  // query's length (so "sahdow" still finds "ShadowMonarch").
  const allowed = Math.max(1, Math.floor([...q].length / 4));
  const whole = distance(q, n, allowed);
  if (whole <= allowed) return 450 - whole * 60;
  const head = [...n].slice(0, [...q].length).join("");
  const partial = distance(q, head, allowed);
  if (partial <= allowed && [...q].length >= 3) return 350 - partial * 60;
  return 0;
}

// entries: [{ uid, name }] → the best matches, exact first. Ties go to the
// shorter name, then alphabetical, so the order does not wobble.
function search(query, entries, exclude) {
  const skip = new Set(exclude || []);
  return entries
    .filter((e) => e && e.uid && e.name && !skip.has(e.uid))
    .map((e) => ({ uid: e.uid, name: e.name, score: score(query, e.name) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || [...a.name].length - [...b.name].length || (a.name < b.name ? -1 : 1))
    .slice(0, RESULTS);
}

module.exports = { SHARDS, RESULTS, fold, shardOf, distance, score, search };
