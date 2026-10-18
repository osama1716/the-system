// Just enough of a JavaScript reader to answer two questions about a file:
// which names its top-level statements declare, and which names its code
// refers to (an identifier that is not a property after "." and not an object
// key). Strings, templates, comments and regex literals are skipped whole.
// Used by tests/test-functions-split.js; no dependencies, like every test.
"use strict";

const EXPR_KEYWORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"]);

function tokenize(src) {
  const toks = [];
  const stack = [];
  let i = 0, depth = 0;
  const n = src.length;
  const regexAllowed = () => {
    const p = toks[toks.length - 1];
    if (!p) return true;
    if (p.t === "num" || p.t === "str" || p.t === "tpl" || p.t === "re") return false;
    if (p.t === "id") return EXPR_KEYWORDS.has(p.v);
    return !(p.v === ")" || p.v === "]" || p.v === "}");
  };
  // from just inside a template to its end or its next ${
  const template = () => {
    while (i < n) {
      if (src[i] === "\\") { i += 2; continue; }
      if (src[i] === "`") { i++; return false; }
      if (src[i] === "$" && src[i + 1] === "{") { i += 2; return true; }
      i++;
    }
    throw new Error("unterminated template");
  };
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 2; if (i < 2) throw new Error("unterminated comment"); continue; }
    const s = i;
    if (c === "'" || c === '"') {
      i++;
      while (i < n && src[i] !== c) { if (src[i] === "\\") i++; i++; }
      i++;
      toks.push({ t: "str", s, depth });
    } else if (c === "`") {
      i++;
      if (template()) { stack.push("tpl"); depth++; }
      toks.push({ t: "tpl", s, depth });
    } else if (/[A-Za-z_$]/.test(c)) {
      while (i < n && /[\w$]/.test(src[i])) i++;
      toks.push({ t: "id", v: src.slice(s, i), s, depth });
    } else if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1]))) {
      while (i < n && /[\w.]/.test(src[i])) i++;
      toks.push({ t: "num", s, depth });
    } else if (c === "/" && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < n && (inClass || src[i] !== "/")) {
        if (src[i] === "\\") i++;
        else if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "\n") throw new Error("newline in a regex at " + s);
        i++;
      }
      i++;
      while (i < n && /[a-z]/.test(src[i])) i++;
      toks.push({ t: "re", s, depth });
    } else if (c === "{" || c === "(" || c === "[") {
      stack.push(c); toks.push({ t: "p", v: c, s, depth }); depth++; i++;
    } else if (c === "}" || c === ")" || c === "]") {
      const top = stack.pop();
      depth--;
      i++;
      if (c === "}" && top === "tpl") {
        if (template()) { stack.push("tpl"); depth++; }
        toks.push({ t: "tpl", s, depth });
      } else toks.push({ t: "p", v: c, s, depth });
    } else if (c === "?" && src[i + 1] === "." && !/[0-9]/.test(src[i + 2])) {
      toks.push({ t: "p", v: "?.", s, depth }); i += 2;
    } else if (c === "." && src[i + 1] === "." && src[i + 2] === ".") {
      toks.push({ t: "p", v: "...", s, depth }); i += 3;
    } else if (".;,:/".includes(c)) {
      const v = c === "/" && src[i + 1] === "=" ? "/=" : c;
      toks.push({ t: "p", v, s, depth }); i += v.length;
    } else {
      let j = i;
      while (j < n && /[=+\-*%&|^!<>~?]/.test(src[j])) j++;
      if (j === i) throw new Error("unexpected " + JSON.stringify(c) + " at " + i);
      toks.push({ t: "p", v: src.slice(i, j), s, depth });
      i = j;
    }
  }
  if (depth !== 0) throw new Error("unbalanced brackets");
  return toks;
}

// { declared: top-level names the file defines, imported: those it takes with
// require(), used: names its code refers to }
function names(src) {
  const toks = tokenize(src.replace(/\r\n/g, "\n"));
  const declared = new Set(), imported = new Set(), used = new Set();
  // the statement starting at token k binds what require() returns
  const isRequire = (k) => {
    let m = k + 1;
    while (m < toks.length && toks[m].v !== "=") m++;
    return toks[m + 1] && toks[m + 1].v === "require";
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k], p = toks[k - 1], nx = toks[k + 1];
    if (t.t !== "id") continue;
    if (p && (p.v === "." || p.v === "?.")) continue;
    // an object key, or in a destructuring require the name before its alias
    if (nx && nx.v === ":" && p && (p.v === "{" || p.v === ",")) continue;
    if (t.depth === 0 && p && (p.v === "function" || p.v === "class" || (p.v === "*" && toks[k - 2] && toks[k - 2].v === "function"))) declared.add(t.v);
    else if (t.depth === 0 && p && ["const", "let", "var"].includes(p.v)) (isRequire(k - 1) ? imported : declared).add(t.v);
    else used.add(t.v);
  }
  // top-level destructuring: const { a, b: c } = …  (depth 1 inside the braces)
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== "id" || t.depth !== 0 || !["const", "let", "var"].includes(t.v) || !toks[k + 1] || toks[k + 1].v !== "{") continue;
    const into = isRequire(k) ? imported : declared;
    let m = k + 2;
    while (m < toks.length && !(toks[m].v === "}" && toks[m].depth === 0)) {
      const u = toks[m], nx = toks[m + 1], pv = toks[m - 1];
      if (u.t === "id" && !(nx && nx.v === ":") && !(pv && pv.v === "=")) { into.add(u.v); used.delete(u.v); }
      m++;
    }
  }
  return { declared, imported, used };
}

module.exports = { tokenize, names };
