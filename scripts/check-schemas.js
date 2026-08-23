// Checks the structured-output schemas in functions/index.js against what the
// Messages API actually accepts, without deploying or spending anything.
//
// It exists because this went wrong twice. The evaluation schema carried
// `minimum: 1` from the day it was written and every call it made was rejected
// with a 400 — nobody noticed, because nobody had exercised that path yet. The
// suggestion schema was then written by copying it, inheriting the same fault,
// plus `minItems`/`maxItems` and a `number` type of its own. Both failures were
// invisible until a person tried the feature and got a generic apology.
//
// The API takes a narrow subset of JSON Schema. Range and length constraints
// are not in it: they are rejected outright, before the model sees anything.
// Bounds belong in code after the response anyway — a schema constrains shape,
// never sanity.
//
//   node scripts/check-schemas.js
//
// Exits non-zero on a violation, so it can gate a deploy.
"use strict";

const fs = require("fs");
const path = require("path");

const SUPPORTED = new Set([
  "type", "properties", "required", "additionalProperties", "items", "enum", "description",
]);

// Named explicitly rather than inferred, so the failure says which one and why.
const KNOWN_REJECTED = {
  minimum: "range constraints are rejected — clamp in code instead",
  maximum: "range constraints are rejected — clamp in code instead",
  minItems: "length constraints are rejected — slice in code, and ask in the prompt",
  maxItems: "length constraints are rejected — slice in code, and ask in the prompt",
  minLength: "length constraints are rejected — slice in code instead",
  maxLength: "length constraints are rejected — slice in code instead",
  pattern: "not supported — validate in code instead",
  format: "not supported — validate in code instead",
  default: "not supported — apply the default in code instead",
  oneOf: "not supported — model the union as an enum or separate fields",
  anyOf: "not supported — model the union as an enum or separate fields",
  allOf: "not supported — inline the composed properties",
  $ref: "not supported — inline the referenced definition",
};

const SOURCE = path.join(__dirname, "..", "functions", "index.js");
const src = fs.readFileSync(SOURCE, "utf8");

// Pull each schema out of the source and evaluate just that object literal, so
// this checks what is actually shipped rather than a copy that can drift.
function extractSchema(name) {
  const start = src.indexOf("const " + name + " = {");
  if (start === -1) throw new Error("couldn't find " + name + " in functions/index.js");
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        const body = src.slice(src.indexOf("{", start), i + 1);
        // The schemas reference the category list; supply a stand-in so the
        // literal evaluates on its own.
        const AI = { INTELLIGENCE_CATEGORIES: [{ key: "self" }, { key: "social" }] };
        return new Function("AI", "return " + body + ";")(AI);
      }
    }
  }
  throw new Error("unbalanced braces reading " + name);
}

// Walk every node. A schema node is anything carrying `type`; its siblings are
// keywords, and `properties` values are nested schemas rather than keywords.
function walk(node, trail, problems) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, trail + "[" + i + "]", problems));
    return;
  }
  Object.keys(node).forEach((key) => {
    const where = trail + "." + key;
    if (key === "properties") {
      Object.keys(node[key]).forEach((prop) => walk(node[key][prop], trail + ".properties." + prop, problems));
      return;
    }
    if (key === "items") {
      walk(node[key], trail + ".items", problems);
      return;
    }
    if (!SUPPORTED.has(key)) {
      problems.push({
        where,
        key,
        why: KNOWN_REJECTED[key] || "not in the supported subset",
      });
    }
  });
  if (node.type === "integer" || node.type === "number") {
    if (node.type === "number") {
      problems.push({ where: trail, key: "type: number", why: "use integer — clamp or scale in code if you need fractions" });
    }
  }
}

let failed = false;
["EVALUATION_SCHEMA", "SUGGESTION_SCHEMA"].forEach((name) => {
  const problems = [];
  walk(extractSchema(name), name, problems);
  if (!problems.length) {
    console.log("ok    " + name);
    return;
  }
  failed = true;
  console.log("FAIL  " + name);
  problems.forEach((p) => console.log("        " + p.where + "  —  " + p.why));
});

if (failed) {
  console.log("\nThese are rejected by the API with a 400 before the model runs.");
  process.exit(1);
}
console.log("\nBoth schemas use only the supported subset.");
