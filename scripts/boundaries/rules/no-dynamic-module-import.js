"use strict";

// bb/no-dynamic-module-import — the blind spot of `no-restricted-imports`.
//
// ESLint 8's core rule reads `import` / `export … from` declarations only. Measured on this repo: a module
// file containing `await import("@/modules/connections")` passes the generated patterns with no report, and
// so do `type X = import("@/modules/connections").Foo` and `require("@/modules/connections")`. All three are
// boundary crossings — at run time and at type level — so this rule applies the module's own row to them.
//
// It takes the row as an option (`{ module, allowed }`), written into `eslint.boundaries.js` by the
// generator, so there is still exactly one source for the table. Path questions and the narrow test-file
// exemption come from `lib/module-context.js`, shared with `bb/no-relative-module-escape`.
//
// A specifier that is not a plain string is reported rather than skipped: a gate that cannot see what it is
// being asked to allow must say so, not wave it through.

const moduleContextOf = require("./lib/module-context");

const MODULE_SPECIFIER = "@/modules/";

// In a type position the specifier is wrapped: the field is a `TSLiteralType` whose `literal` is the string.
// `source` is the current name; `argument` / `parameter` are the two earlier ones.
function specifierOfType(node) {
  const field = node.source ?? node.argument ?? node.parameter;
  return field?.type === "TSLiteralType" ? field.literal : field;
}

// `require("@/modules/x")` / `require.resolve(…)` reach the same places, and no core rule reads them either
// (silent-failure-hunter, S6 review).
function isRequire(callee) {
  if (callee.type === "Identifier") return callee.name === "require";
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "require" &&
    callee.property.name === "resolve"
  );
}

/** Judges one specifier against the module's row: unreadable, escaping, restricted, or fine. */
function checkerFor(context, here, moduleName, allowed) {
  const allowedSet = new Set(allowed);
  const own = `${MODULE_SPECIFIER}${moduleName}`;
  const allowedList = allowed.join(" · ");

  return (node, sourceNode, kind) => {
    if (
      sourceNode?.type !== "Literal" ||
      typeof sourceNode.value !== "string"
    ) {
      context.report({ node, messageId: "computed", data: { kind } });
      return;
    }
    const source = sourceNode.value;
    const data = { kind, source, module: moduleName };

    if (source.startsWith(".")) {
      const resolved = here.resolve(source);
      if (here.staysInside(resolved)) return;
      if (here.isTest && here.leavesModuleTree(resolved)) return;
      context.report({
        node: sourceNode,
        messageId: "escape",
        data: { ...data, resolved: here.display(resolved) },
      });
      return;
    }

    if (!source.startsWith(MODULE_SPECIFIER)) return;
    if (
      allowedSet.has(source) ||
      source === own ||
      source.startsWith(`${own}/`)
    )
      return;
    context.report({
      node: sourceNode,
      messageId: "restricted",
      data: { ...data, allowed: allowedList },
    });
  };
}

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "a dynamic, type-position or `require` import obeys the same allowed-imports row as a static one (01 §2.3)",
    },
    schema: [
      {
        type: "object",
        properties: {
          module: { type: "string" },
          allowed: { type: "array", items: { type: "string" } },
        },
        required: ["module", "allowed"],
        additionalProperties: false,
      },
    ],
    messages: {
      restricted:
        '`{{kind}}("{{source}}")` crosses a boundary the row does not allow. `{{module}}` may import {{allowed}} — nothing else (01 §2.3, §2.4), and a dynamic, type-position or `require` import is an import.',
      escape:
        '`{{kind}}("{{source}}")` leaves `{{module}}` and reaches `{{resolved}}`. Cross-module traffic goes through the other module\'s connector (`@/modules/<module>`), never a relative path into its inside (01 §2.3; 05 §7 rule 2).',
      computed:
        "`{{kind}}()` here is given a computed specifier, so the boundary lint cannot check it. Write the module path as a literal (01 §2.3; 05 §7 rules 1–2).",
    },
  },

  create(context) {
    const { module: moduleName, allowed } = context.options[0] ?? {};
    if (typeof moduleName !== "string" || !Array.isArray(allowed))
      throw new Error(
        "bb/no-dynamic-module-import needs { module, allowed } — it is written by scripts/gen-boundary-rules.ts",
      );

    const here = moduleContextOf(context.filename ?? context.getFilename());
    if (here === null) return {};

    const check = checkerFor(context, here, moduleName, allowed);
    return {
      ImportExpression: (node) => check(node, node.source, "import"),
      TSImportType: (node) => check(node, specifierOfType(node), "import"),
      CallExpression(node) {
        if (isRequire(node.callee)) check(node, node.arguments[0], "require");
      },
    };
  },
};
