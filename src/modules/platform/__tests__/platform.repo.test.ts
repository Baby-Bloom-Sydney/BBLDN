// Repo-level rules for the platform module (build-standard L1 / L3; 01 §2.3 / §2.4; 05 §7 rule 6): one export per
// non-barrel file, a service module imports only config + shared-types, `console.*` only in the console sink,
// no direct environment read, every sub-module of 01 §2.5 has its connector, stubs export one thing.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MODULE_DIR = resolve(__dirname, "..");
const BARRELS = new Set(["index.ts", "types.ts"]);
const CONSOLE_CALLERS = new Set([
  "log/lib/console-sink.ts",
  "log/lib/report-sink-failure.ts",
]);
const ENV_READ = ["process", "env"].join(".");
const ALLOWED_MODULE_IMPORTS = new Set([
  "@/modules/config",
  "@/modules/shared-types",
]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory())
      return entry === "__tests__" ? [] : listSourceFiles(full);
    return entry.endsWith(".ts") ? [full] : [];
  });
}

const files = listSourceFiles(MODULE_DIR);
const rel = (file: string) => relative(MODULE_DIR, file);
const nonBarrels = files.filter(
  (file) => !BARRELS.has(file.split("/").at(-1) ?? ""),
);

describe("platform — one export per file (L1; 05 §7 rule 4)", () => {
  it.each(nonBarrels.map(rel))("%s exports exactly one thing", (file) => {
    const lines = readFileSync(join(MODULE_DIR, file), "utf8")
      .split("\n")
      .filter((line) => /^export\s/.test(line));
    expect(lines, lines.join("\n")).toHaveLength(1);
  });

  it("every 01 §2.5 sub-module has its own index.ts + types.ts, and each stub is one file exporting one thing", () => {
    for (const sub of [
      "log",
      "events",
      "consent",
      "rate-limit",
      "upload-scan",
    ]) {
      expect(files.map(rel)).toContain(`${sub}/index.ts`);
      expect(files.map(rel)).toContain(`${sub}/types.ts`);
    }
    expect(files.map(rel)).toContain("consent/consent.stub.ts");
    expect(files.map(rel)).toContain("upload-scan/upload-scan.stub.ts");
  });
});

describe("platform — a service module is a leaf (01 §2.4; 03 §1 rule 3)", () => {
  it.each(files.map(rel))(
    "%s imports only config, shared-types, zod and node built-ins",
    (file) => {
      const source = readFileSync(join(MODULE_DIR, file), "utf8");
      const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
        (m) => m[1] ?? "",
      );
      for (const spec of specifiers) {
        if (spec.startsWith(".")) continue;
        const allowed =
          ALLOWED_MODULE_IMPORTS.has(spec) ||
          spec === "zod" ||
          spec.startsWith("node:") ||
          spec === "@/modules/shared-types/events";
        expect(allowed, `${file} imports ${spec}`).toBe(true);
      }
      expect(
        source.includes("@/modules/config/server"),
        `${file} must stay client-safe`,
      ).toBe(false);
    },
  );

  it("only the console sink (+ its failure reporter) calls console.*, and nothing reads the environment directly", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!CONSOLE_CALLERS.has(rel(file)))
        expect(
          /\bconsole\.(log|warn|error|info|debug)\(/.test(source),
          rel(file),
        ).toBe(false);
      expect(source.includes(ENV_READ), rel(file)).toBe(false);
    }
  });

  it("no file exceeds 800 lines", () => {
    for (const file of files)
      expect(
        readFileSync(file, "utf8").split("\n").length,
        rel(file),
      ).toBeLessThanOrEqual(800);
  });
});
