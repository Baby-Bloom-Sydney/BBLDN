"use strict";

// bb/no-relative-module-escape — the other half of 05 §7 rules 1–2.
//
// The generated `no-restricted-imports` patterns match the specifier as written, so `../../positions/lib/pick`
// walks straight past them and lands in another module's internals. This rule resolves every relative
// specifier against the importing file and refuses any that leaves the module it started in. Cross-module
// traffic is `@/modules/<x>` — the connector — and is judged by the generated patterns.
//
// Test files get a **narrow** exemption, not a blanket one (silent-failure-hunter, S6 review): a test may
// reach outside `src/modules` entirely — `src/modules/config/__tests__/config.repo.test.ts` reads
// `scripts/env/lib/…` on purpose, to prove the committed `.env.example` is what the generator writes — but a
// test reaching into *another module's* inside is the same architecture erosion as production code doing it,
// and is reported.

const MODULE_ROOT = /^(?<root>.*\/src\/modules\/[^/]+\/)/u;
const MODULES_ROOT = "/src/modules/";

const isTestPath = (posixPath) =>
  posixPath.includes("/__tests__/") ||
  /\.(test|spec)\.[cm]?[jt]sx?$/u.test(posixPath);

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
        "a relative import may not leave its own module (01 §2.3; 05 §7 rule 2)",
    },
    schema: [],
    messages: {
      escape:
        "`{{source}}` leaves `{{module}}` and reaches `{{resolved}}`. Cross-module imports go through the other module's connector (`@/modules/<module>`), never a relative path into its inside (01 §2.3; 05 §7 rule 2).",
    },
  },

  create(context) {
    const filename = (context.filename ?? context.getFilename() ?? "").replace(
      /\\/gu,
      "/",
    );
    const root = MODULE_ROOT.exec(filename)?.groups?.root;
    if (root === undefined) return {};
    const isTest = isTestPath(filename);

    const directory = filename.slice(0, filename.lastIndexOf("/"));
    const segments = root.split("/").filter(Boolean);
    const moduleName = segments[segments.length - 1];

    const check = (node) => {
      const source = node.source?.value;
      if (typeof source !== "string" || !source.startsWith(".")) return;
      const resolved = resolvePosix(directory, source);
      if (resolved.startsWith(root)) return;
      if (isTest && !resolved.includes(MODULES_ROOT)) return;
      const inside = resolved.indexOf("/src/");
      context.report({
        node: node.source,
        messageId: "escape",
        data: {
          source,
          module: moduleName,
          resolved: inside === -1 ? resolved : resolved.slice(inside + 1),
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
