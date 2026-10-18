// The Cloud Functions' own files (functions/index.js was split into api/ and
// server/ on 2026-10-18), for the tests that read the server's source as text
// instead of running it. The single-purpose modules beside them (progress.js,
// shop.js…) are required by their own tests and are not in this list.
"use strict";
const fs = require("fs");
const path = require("path");

const F = path.join(__dirname, "..", "functions");
const dir = (d) => fs.readdirSync(path.join(F, d)).filter((f) => f.endsWith(".js")).sort().map((f) => d + "/" + f);
const FILES = ["index.js", ...dir("server"), ...dir("api")];

module.exports = FILES.map((f) => "functions/" + f);
// All of them as one text, CRLF made LF.
module.exports.source = () => FILES.map((f) => fs.readFileSync(path.join(F, f), "utf8")).join("\n").replace(/\r\n/g, "\n");
