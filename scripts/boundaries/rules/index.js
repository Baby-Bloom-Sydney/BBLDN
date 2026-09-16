"use strict";

// The `bb` plugin the generated `eslint.boundaries.js` registers. Four rules, hand-written (they are logic,
// not table data, so they are not generated): the L1 one-export rule, the two guards that close
// `no-restricted-imports`' blind spots (relative paths and `import()` expressions), and the
// interpolated-log-message rule the S3 security review handed to S6. 05 §7 rule 4 names
// `bb/one-export-per-file`; `no-dynamic-module-import` takes its row from the generator as an option.

module.exports = {
  meta: { name: "eslint-plugin-bb", version: "1.0.0" },
  rules: {
    "one-export-per-file": require("./one-export-per-file"),
    "no-relative-module-escape": require("./no-relative-module-escape"),
    "no-interpolated-log-message": require("./no-interpolated-log-message"),
    "no-dynamic-module-import": require("./no-dynamic-module-import"),
  },
};
