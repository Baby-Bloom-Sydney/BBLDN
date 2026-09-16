"use strict";

// bb/one-export-per-file — L1, "a file exports exactly one thing" (05 §7 rule 4).
//
// What counts: one **value** export (an action, a component, a helper, a stub). Type-only exports never count
// against it — they are the "one type group" L1 names, and a value with the types that describe it is still
// one thing. A file with no export at all is also a failure: `src/modules/**` holds no side-effect modules.
//
// The exceptions are listed here, never in the files (05 §7 rule 4):
//   index.ts / index.tsx  — the connector's re-exports (01 §2.5), at any depth (sub-module connectors)
//   types.ts / types.tsx  — types only, at any depth
//   *.test.* / *.spec.* and anything under __tests__/ — test code and its fixtures (01 §2.5 folder shape)
//   page / layout / route — a Next route file may export `default` plus the framework's own named exports
//
// `*.stub.ts` is deliberately **not** exempt: a stub honours one connector export like any other file.

const EXEMPT_BASENAMES = new Set([
  "index.ts",
  "index.tsx",
  "types.ts",
  "types.tsx",
]);

const ROUTE_BASENAMES = new Set([
  "page.ts",
  "page.tsx",
  "layout.ts",
  "layout.tsx",
  "route.ts",
  "route.tsx",
]);

const ROUTE_EXPORTS = new Set([
  "metadata",
  "generateMetadata",
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const TYPE_DECLARATIONS = new Set([
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSDeclareFunction",
  "TSModuleDeclaration",
]);

const isTestPath = (posixPath) =>
  posixPath.includes("/__tests__/") ||
  /\.(test|spec)\.[cm]?[jt]sx?$/u.test(posixPath);

/**
 * Every binding a declarator's target introduces. `export const { a, b } = actions;` publishes two names from
 * one declarator, and collapsing that to a single placeholder was the `utils` grab-bag L1 forbids wearing a
 * destructuring hat (code-reviewer, S6 review).
 */
function boundNamesOf(target) {
  if (target === null || target === undefined) return [];
  switch (target.type) {
    case "Identifier":
      return [target.name];
    case "ObjectPattern":
      return target.properties.flatMap((property) =>
        boundNamesOf(
          property.type === "RestElement" ? property.argument : property.value,
        ),
      );
    case "ArrayPattern":
      return target.elements.flatMap(boundNamesOf);
    case "AssignmentPattern":
      return boundNamesOf(target.left);
    case "RestElement":
      return boundNamesOf(target.argument);
    default:
      return ["(pattern)"];
  }
}

/** Every value export a top-level node declares, as `{ node, name }` (types are not value exports). */
function valueExportsOf(node) {
  if (node.type === "ExportDefaultDeclaration")
    return [{ node, name: "default" }];
  if (node.type === "ExportAllDeclaration")
    return node.exportKind === "type" ? [] : [{ node, name: "*" }];
  if (node.type !== "ExportNamedDeclaration" || node.exportKind === "type")
    return [];

  const { declaration } = node;
  if (declaration === null || declaration === undefined)
    return node.specifiers
      .filter((specifier) => specifier.exportKind !== "type")
      .map((specifier) => ({ node: specifier, name: specifier.exported.name }));

  // `export declare const x` / `declare function` publish an ambient *type* surface, not a value this file
  // owns — a hand-written `.d.ts` is a declaration group, the type-group case (typescript-reviewer, S6).
  if (TYPE_DECLARATIONS.has(declaration.type) || declaration.declare === true)
    return [];
  if (declaration.type === "VariableDeclaration")
    return declaration.declarations.flatMap((declarator) =>
      boundNamesOf(declarator.id).map((name) => ({ node: declarator, name })),
    );
  return [{ node: declaration, name: declaration.id?.name ?? "default" }];
}

const hasAnyExport = (body) =>
  body.some(
    (node) =>
      node.type === "ExportDefaultDeclaration" ||
      node.type === "ExportAllDeclaration" ||
      node.type === "ExportNamedDeclaration",
  );

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "a file under src/modules exports exactly one value (L1; 05 §7 rule 4)",
    },
    schema: [],
    messages: {
      tooMany:
        "L1 — one export per file: this file exports {{count}} values ({{names}}). Split it; only index.ts, types.ts, test files and Next route files are exempt (05 §7 rule 4).",
      none: "L1 — one export per file: this file exports nothing. A module file is an action, a component, a helper or a type group.",
      routeExport:
        "A Next route file may export only `default`, `metadata`, `generateMetadata` and the HTTP verbs — `{{name}}` is business logic and belongs in a module (01 §2.5; 05 §7 rules 4–5).",
    },
  },

  create(context) {
    const filename = (context.filename ?? context.getFilename() ?? "").replace(
      /\\/gu,
      "/",
    );
    const basename = filename.slice(filename.lastIndexOf("/") + 1);

    if (EXEMPT_BASENAMES.has(basename) || isTestPath(filename)) return {};

    if (ROUTE_BASENAMES.has(basename))
      return {
        "Program:exit"(program) {
          for (const node of program.body)
            for (const { node: at, name } of valueExportsOf(node))
              if (name !== "default" && !ROUTE_EXPORTS.has(name))
                context.report({
                  node: at,
                  messageId: "routeExport",
                  data: { name },
                });
        },
      };

    return {
      "Program:exit"(program) {
        const exports_ = program.body.flatMap(valueExportsOf);
        if (exports_.length === 0) {
          if (!hasAnyExport(program.body))
            context.report({ node: program, messageId: "none" });
          return;
        }
        if (exports_.length === 1) return;
        const names = exports_.map((each) => each.name).join(", ");
        for (const extra of exports_.slice(1))
          context.report({
            node: extra.node,
            messageId: "tooMany",
            data: { count: String(exports_.length), names },
          });
      },
    };
  },
};
