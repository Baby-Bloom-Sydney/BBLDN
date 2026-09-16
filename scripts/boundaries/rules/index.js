"use strict";

// The `bb` plugin the generated `eslint.boundaries.js` registers. Two rules, hand-written (they are logic, not
// table data, so they are not generated): the L1 one-export rule and the relative-escape guard that closes
// `no-restricted-imports`' blind spot. 05 §7 rule 4 names `bb/one-export-per-file`.

module.exports = {
  meta: { name: "eslint-plugin-bb", version: "1.0.0" },
  rules: {
    "one-export-per-file": require("./one-export-per-file"),
    "no-relative-module-escape": require("./no-relative-module-escape"),
  },
};
