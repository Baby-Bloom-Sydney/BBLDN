"use strict";

// The `bb` plugin this repo's two ESLint configs register. Five rules, hand-written (they are logic, not
// table data, so they are not generated): the L1 one-export rule, the two guards that close
// `no-restricted-imports`' blind spots (relative paths and `import()` expressions), and the
// interpolated-log-message rule the S3 security review handed to S6. 05 §7 rule 4 names
// `bb/one-export-per-file`; `no-dynamic-module-import` takes its row from the generator as an option.
//
// The first four are registered by the generated `eslint.boundaries.js` (the `allowed-imports` job). The
// fifth, `no-discarded-result` (P4-GATES), needs type information and so is registered by `eslint.typed.js`
// in the `lint` job instead. It lives in this folder because this is where this repo's hand-written rules
// live — not because it is a boundary rule.

module.exports = {
  meta: { name: "eslint-plugin-bb", version: "1.0.0" },
  rules: {
    "one-export-per-file": require("./one-export-per-file"),
    "no-relative-module-escape": require("./no-relative-module-escape"),
    "no-interpolated-log-message": require("./no-interpolated-log-message"),
    "no-dynamic-module-import": require("./no-dynamic-module-import"),
    "no-discarded-result": require("./no-discarded-result"),
  },
};
