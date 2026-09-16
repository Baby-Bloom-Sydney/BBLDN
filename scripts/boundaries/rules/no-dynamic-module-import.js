"use strict";

// bb/no-dynamic-module-import — the third blind spot of `no-restricted-imports`.
//
// ESLint 8's core rule reads `import` / `export … from` declarations only. Measured on this repo: a module
// file containing `await import("@/modules/connections")` passes the generated patterns with no report, and
// so does `type X = import("@/modules/connections").Foo`. Both are boundary crossings — one at run time, one
// at type level — so this rule applies the module's own row to them.
//
// It takes the row as an option (`{ module, allowed }`), written into `eslint.boundaries.js` by the
// generator, so there is still exactly one source for the table.
//
// A specifier that is not a plain string is reported rather than skipped: a gate that cannot see what it is
// being asked to allow must say so, not wave it through.

const MODULE_ROOT = /^(?<root>.*\/src\/modules\/[^/]+\/)/u;
const MODULE_SPECIFIER = "@/modules/";

/** Joins a relative specifier onto a directory, resolving `.` and `..`, without touching the filesystem. */
function resolvePosix(fromDirectory, specifier) {
  const segments = [];
  for (const segment of `${fromDirectory}/${specifier}`.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "a dynamic or type-position `import()` obeys the same allowed-imports row as a static one (01 §2.3)",
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
        '`import("{{source}}")` crosses a boundary the row does not allow. `{{module}}` may import {{allowed}} — nothing else (01 §2.3, §2.4), and a dynamic or type-position import is an import.',
      escape:
        '`import("{{source}}")` leaves `{{module}}`. Cross-module traffic goes through the other module\'s connector (`@/modules/<module>`), never a relative path into its inside (01 §2.3; 05 §7 rule 2).',
      computed:
        "`import()` here is given a computed specifier, so the boundary lint cannot check it. Write the module path as a literal (01 §2.3; 05 §7 rules 1–2).",
    },
  },

  create(context) {
    const { module: moduleName, allowed } = context.options[0] ?? {};
    if (typeof moduleName !== "string" || !Array.isArray(allowed))
      throw new Error(
        "bb/no-dynamic-module-import needs { module, allowed } — it is written by scripts/gen-boundary-rules.ts",
      );

    const filename = (context.filename ?? context.getFilename() ?? "").replace(
      /\\/gu,
      "/",
    );
    const root = MODULE_ROOT.exec(filename)?.groups?.root;
    if (root === undefined) return {};

    const directory = filename.slice(0, filename.lastIndexOf("/"));
    const allowedSet = new Set(allowed);
    const own = `${MODULE_SPECIFIER}${moduleName}`;
    const allowedList = allowed.join(" · ");

    const check = (node, sourceNode) => {
      if (
        sourceNode === null ||
        sourceNode === undefined ||
        sourceNode.type !== "Literal" ||
        typeof sourceNode.value !== "string"
      ) {
        context.report({ node, messageId: "computed" });
        return;
      }
      const source = sourceNode.value;
      if (source.startsWith(".")) {
        if (resolvePosix(directory, source).startsWith(root)) return;
        context.report({
          node: sourceNode,
          messageId: "escape",
          data: { source, module: moduleName },
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
        data: { source, module: moduleName, allowed: allowedList },
      });
    };

    // In a type position the specifier is wrapped: `TSImportType.argument` is a `TSLiteralType` whose
    // `literal` is the string (older parsers called the field `parameter`).
    const specifierOfType = (node) => {
      const argument = node.argument ?? node.parameter;
      return argument?.type === "TSLiteralType" ? argument.literal : argument;
    };

    return {
      ImportExpression: (node) => check(node, node.source),
      TSImportType: (node) => check(node, specifierOfType(node)),
    };
  },
};
