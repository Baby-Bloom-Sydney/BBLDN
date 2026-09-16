"use strict";

// bb/no-relative-module-escape — the other half of 05 §7 rules 1–2.
//
// The generated `no-restricted-imports` patterns match the specifier as written, so `../../positions/lib/pick`
// walks straight past them and lands in another module's internals. This rule resolves every relative
// specifier against the importing file and refuses any that leaves the module it started in. Cross-module
// traffic is `@/modules/<x>` — the connector — and is judged by the generated patterns.
//
// The where-am-I and where-does-this-go questions, and the narrow test-file exemption, live in
// `lib/module-context.js`, shared with `bb/no-dynamic-module-import` so the static and dynamic halves of the
// same rule cannot drift apart (typescript-reviewer, S6 review).

const moduleContextOf = require("./lib/module-context");

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "a relative import may not leave its own module (01 §2.3; 05 §7 rule 2)",
    },
    schema: [],
    messages: {
      escape:
        "`{{source}}` leaves `{{module}}` and reaches `{{resolved}}`. Cross-module imports go through the other module's connector (`@/modules/<module>`), never a relative path into its inside (01 §2.3; 05 §7 rule 2).",
    },
  },

  create(context) {
    const here = moduleContextOf(context.filename ?? context.getFilename());
    if (here === null) return {};

    const check = (node) => {
      const source = node.source?.value;
      if (typeof source !== "string" || !source.startsWith(".")) return;
      const resolved = here.resolve(source);
      if (here.staysInside(resolved)) return;
      if (here.isTest && here.leavesModuleTree(resolved)) return;
      context.report({
        node: node.source,
        messageId: "escape",
        data: {
          source,
          module: here.moduleName,
          resolved: here.display(resolved),
        },
      });
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};
