// BUILD-FIX (L-007) — the build-boundary pin: **no `"use client"` module reaches a `server-only` module.**
//
// `next build` enforces this too, but only as the last gate of the slowest command in the repo, and `1b` landed
// with `build` unmeasured (PR #22) — `main` went red on exactly this: the `server-only` service-role client
// (`auth/lib/elevated-client.ts`) reachable from `src/components/layout/MiniFooter.tsx` through the `public-site`
// and `matching` connector barrels. This suite measures the same graph in milliseconds, so the next such import
// fails in `npm test` instead of in a Vercel preview.
//
// It walks the graph the way webpack does, which is why two details matter:
//   - **type-only imports are ignored.** They are erased before webpack sees them, so `matching/types.ts`'s
//     `import type { Session } from "@/modules/auth"` is not a client-bundle edge. Walking them would report
//     eight violations that do not exist.
//   - **dynamic `import()` is an edge.** `supabase-auth-driver.ts` loads the elevated client lazily precisely so
//     the key's name stays out of client chunks, and webpack still compiles the chunk into the client graph —
//     which is how the `server-only` error was raised. A walker that skipped `import()` would miss the defect.
//     The one exception is webpack's own `/* webpackIgnore: true */`, which leaves the specifier unresolved and
//     un-bundled (`platform/unit-of-work` reaches `node:async_hooks` that way, and only on the server).
// Traversal stops at a `"use server"` module: Next replaces those with a client reference, so their imports are
// not in the client bundle (01 §4e — "server actions are passed to client components as props").
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC_ROOT = join(REPO_ROOT, "src");
const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];
const INDEX_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const SERVER_ONLY = "server-only";
/** `server-only` is the guard 07 §7 item 3 puts on a secret-reading module; a `node:` builtin cannot be in a
 *  client bundle at all (webpack: "Reading from `node:async_hooks` is not handled by plugins"). Both are the
 *  same defect seen from two sides, and `next build` refuses both, so both are pinned here. */
const isServerScheme = (specifier: string): boolean =>
  specifier === SERVER_ONLY || specifier.startsWith("node:");

type Directive = "use client" | "use server" | null;
type Node = {
  readonly directive: Directive;
  readonly imports: readonly string[];
  /** The server-side specifier this file imports directly (`server-only` / `node:*`), if any. */
  readonly serverSpecifier: string | undefined;
};

function listSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listSourceFiles(full, found);
    else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext)))
      found.push(full);
  }
  return found;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

function directiveOf(source: ts.SourceFile): Directive {
  const [first] = source.statements;
  if (first === undefined || !ts.isExpressionStatement(first)) return null;
  if (!ts.isStringLiteral(first.expression)) return null;
  const text = first.expression.text;
  return text === "use client" || text === "use server" ? text : null;
}

/** True when the whole statement is erased by the compiler and never becomes a bundle edge. */
function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return false; // bare `import "x"` — a side-effect edge.
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  if (
    clause.name !== undefined ||
    bindings === undefined ||
    !ts.isNamedImports(bindings)
  )
    return false;
  return bindings.elements.every((element) => element.isTypeOnly);
}

function isTypeOnlyReExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  if (clause === undefined || !ts.isNamedExports(clause)) return false;
  return clause.elements.every((element) => element.isTypeOnly);
}

/** An `import()` carrying webpack's `webpackIgnore: true` magic comment is left verbatim and never bundled. */
function isIgnoredByBundler(call: ts.CallExpression): boolean {
  return /webpackIgnore\s*:\s*true/.test(call.getText());
}

/** Every specifier that survives type erasure: static imports, re-exports and `import()` expressions. */
function valueSpecifiers(source: ts.SourceFile): string[] {
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (!isTypeOnlyImport(node)) found.add(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined
    ) {
      if (ts.isStringLiteral(node.moduleSpecifier) && !isTypeOnlyReExport(node))
        found.add(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [argument] = node.arguments;
      if (
        argument !== undefined &&
        ts.isStringLiteral(argument) &&
        !isIgnoredByBundler(node)
      )
        found.add(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found];
}

/** `@/…` and relative specifiers only; a package specifier other than `server-only` is not our graph. */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(SRC_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...INDEX_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ];
  return (
    candidates.find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    ) ?? null
  );
}

function buildGraph(files: readonly string[]): Map<string, Node> {
  const graph = new Map<string, Node>();
  for (const file of files) {
    const source = parse(file);
    const specifiers = valueSpecifiers(source);
    const imports = specifiers
      .map((specifier) => resolveSpecifier(specifier, file))
      .filter((resolved): resolved is string => resolved !== null);
    graph.set(file, {
      directive: directiveOf(source),
      imports,
      serverSpecifier: specifiers.find(isServerScheme),
    });
  }
  return graph;
}

/** The shortest `root → … → server specifier` chain, for the failure message. Empty when there is none. */
function chainToServerSide(root: string, graph: Map<string, Node>): string[] {
  const seen = new Set([root]);
  const queue: string[][] = [[root]];
  while (queue.length > 0) {
    const path = queue.shift() as string[];
    const node = graph.get(path[path.length - 1]);
    if (node === undefined) continue;
    if (path.length > 1 && node.directive === "use server") continue;
    if (node.serverSpecifier !== undefined)
      return [...path, node.serverSpecifier];
    for (const next of node.imports) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  return [];
}

const readable = (chain: readonly string[]): string =>
  chain
    .map((entry) =>
      entry.startsWith(SRC_ROOT) ? relative(REPO_ROOT, entry) : entry,
    )
    .join("\n    → ");

describe("client/server bundle boundary (07 §7 item 3)", () => {
  const graph = buildGraph(listSourceFiles(SRC_ROOT));
  const clientRoots = [...graph.entries()]
    .filter(([, node]) => node.directive === "use client")
    .map(([file]) => file);

  it("finds the client components to check", () => {
    expect(clientRoots.length).toBeGreaterThan(100);
  });

  it("resolves the graph it walks (the `server-only` module is in it)", () => {
    const elevated = join(SRC_ROOT, "modules/auth/lib/elevated-client.ts");
    expect(graph.get(elevated)?.serverSpecifier).toBe(SERVER_ONLY);
  });

  it("follows `@/modules` edges out of a client component (the walk is not empty)", () => {
    const combobox = join(
      SRC_ROOT,
      "modules/matching/components/AreaCombobox.tsx",
    );
    expect(graph.get(combobox)?.imports).toContain(
      join(SRC_ROOT, "modules/areas/index.ts"),
    );
  });

  it("no `use client` module reaches `server-only` or a `node:` builtin", () => {
    const offenders = clientRoots
      .map((root) => chainToServerSide(root, graph))
      .filter((chain) => chain.length > 0)
      .map(readable);
    expect(offenders).toEqual([]);
  });
});
