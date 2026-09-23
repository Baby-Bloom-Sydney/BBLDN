// `unit.legal-document-reads` (L-009 `3m`) — two gates over the way the tree reaches a legal document.
//
// Both are rule-1 conversions: each is a finding that would otherwise be a paragraph somebody has to remember.
//
// **Gate 1 — a document id is not a route.** `PolicyContent` derived a `/legal/*` path from a document id with
// a two-entry map and a `` `/legal/${slug}` `` guess underneath. Measured against `next dev` on the applied
// stack, the guess resolves for four of the eleven seeded ids and 404s for five. Nothing in `src/` may build a
// `/legal/` path out of a variable again: the seven pages are named literals (`URLS.paths.legal.*` and the
// register), and a consent surface reads the row by its id instead.
//
// **Gate 2 — `legal_documents` is read at the reader's own privilege.** `0003` gives the table an explicit
// `anon` SELECT policy with `qual = true` and no write policy for any client role, so every reader already has
// the privilege it needs. Reading it with `createAdminClient` converts an RLS decision into a key-possession
// decision: more privilege than the read wants, and *less availability*, because the surface then stops
// working the moment the service-role key is absent. Three files in `src/` name the table; this asserts none
// of them reaches it through the admin client.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");

/** Tracked `.ts`/`.tsx` under `src/`, excluding tests — git is the file list so an untracked scratch file cannot make a gate green. */
function sourceFiles(): ReadonlyArray<string> {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "src/**/*.ts", "src/**/*.tsx"],
    { cwd: path.resolve(SRC, ".."), encoding: "utf8" },
  );
  return out
    .split("\0")
    .filter((f) => f.length > 0)
    .filter((f) => !/\.(test|spec)\.tsx?$/.test(f));
}

/**
 * The file with its comments removed. Both gates judge **code**; a header that explains the defect by quoting
 * it — as these fixes do — must not trip the gate that forbids it. Block comments go wholesale, then any line
 * that is itself a comment; a `//` inside a string on a code line is left alone, so no real call site hides.
 */
const read = (file: string): string =>
  readFileSync(path.resolve(SRC, "..", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");

describe("unit.legal-document-reads — gate 1: a document id is not a route", () => {
  it("no source file builds a /legal/ path from a variable", () => {
    const offenders = sourceFiles().filter((file) =>
      /["'`]\/legal\/[^"'`\n]*\$\{/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("no source file keeps a document-id-to-legal-page map", () => {
    const offenders = sourceFiles().filter((file) =>
      /SLUG_TO_LEGAL_PAGE/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("unit.legal-document-reads — gate 2: read at the reader's own privilege", () => {
  it("every src/ file naming legal_documents avoids the admin client", () => {
    const readers = sourceFiles().filter((file) =>
      /["']legal_documents["']/.test(read(file)),
    );
    // If this drops to zero the gate has stopped watching anything.
    expect(readers.length).toBeGreaterThan(0);
    const privileged = readers.filter((file) =>
      /from\s+["']@\/lib\/supabase\/admin["']/.test(read(file)),
    );
    expect(privileged).toEqual([]);
  });
});
