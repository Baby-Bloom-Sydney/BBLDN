"use strict";

// The `bb` plugin the generated `eslint.boundaries.js` registers. Three rules, hand-written (they are logic,
// not table data, so they are not generated): the L1 one-export rule, the relative-escape guard that closes
// `no-restricted-imports`' blind spot, and the interpolated-log-message rule the S3 security review handed to
// S6. 05 §7 rule 4 names `bb/one-export-per-file`.

module.exports = {
  meta: { name: "eslint-plugin-bb", version: "1.0.0" },
  rules: {
    "one-export-per-file": require("./one-export-per-file"),
    "no-relative-module-escape": require("./no-relative-module-escape"),
    "no-interpolated-log-message": require("./no-interpolated-log-message"),
  },
};
