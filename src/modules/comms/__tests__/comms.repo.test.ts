// Repo-level rules for the `comms` module (build-standard L1 / L3; 01 §2.3 / §2.5; 05 §7 rule 6): the
// folder shape, one export per non-barrel file, and the 01 §2.3 allowed-imports row asserted from the
// module's own source rather than only by the lint (so a `lint:boundaries` regression cannot pass silently).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MODULE_DIR = resolve(__dirname, "..");
const BARRELS = new Set(["index.ts", "types.ts"]);
const ALLOWED_MODULE_IMPORTS = new Set([
  "config",
  "config/server",
  "shared-types",
  "platform",
]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory())
      return entry === "__tests__" ? [] : listSourceFiles(full);
    return entry.endsWith(".ts") || entry.endsWith(".tsx") ? [full] : [];
  });
}

const files = listSourceFiles(MODULE_DIR);
const rel = (file: string) => relative(MODULE_DIR, file);
const nonBarrels = files.filter(
  (file) => !BARRELS.has(file.split("/").at(-1) ?? ""),
);

describe("comms — folder shape (01 §2.5)", () => {
  it("has a connector, a type surface and a README", () => {
    for (const required of ["index.ts", "types.ts"]) {
      expect(files.map(rel)).toContain(required);
    }
    expect(readdirSync(MODULE_DIR)).toContain("README.md");
  });
});

describe("comms — one export per file (L1; 05 §7 rule 4)", () => {
  it("is a connector with at least a barrel", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(nonBarrels.length === 0 ? [] : nonBarrels.map(rel))(
    "%s exports exactly one thing",
    (file) => {
      const lines = readFileSync(join(MODULE_DIR, file), "utf8")
        .split("\n")
        .filter((line) => /^export\s/.test(line));
      expect(lines, lines.join("\n")).toHaveLength(1);
    },
  );
});

describe("comms — allowed imports (01 §2.3)", () => {
  it.each(files.map(rel))("%s imports only what its row allows", (file) => {
    const imports = [
      ...readFileSync(join(MODULE_DIR, file), "utf8").matchAll(
        /from "@\/modules\/([^"]+)"/gu,
      ),
    ].map((match) => match[1] ?? "");
    for (const target of imports) {
      if (target === "comms" || target.startsWith("comms/")) continue;
      expect(ALLOWED_MODULE_IMPORTS, `${file} → ${target}`).toContain(target);
    }
  });
});
