// The game rules (js/engine-*.js, split from engine.js on 2026-10-16), in the
// order the app loads them, for the tests that run them in a vm sandbox.
"use strict";
module.exports = require("../js/load-order.json").filter((f) => /^js\/engine-[\w-]+\.js$/.test(f)).map((f) => f.slice(3));
