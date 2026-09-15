#!/usr/bin/env node
// check-env-reads.mjs — `process.env` is read only by the config module's two readers:
// src/modules/config/env.ts (server, every name) and src/modules/config/public-env.ts (client, the
// NEXT_PUBLIC_* names + NODE_ENV as literal accesses) — 01 §1.3 rule 1; 01 §3.3; 05 §6 "env" row; 07 §7.
// The legacy tree is excluded by the committed literal-exclusions.json until F-d (HANDOFF §7).
// Reports check `banned-literals` (HANDOFF §9). Exit 0 = clean; 1 = hits listed.
import { readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./lib/list-files.mjs";
import { loadExclusions } from "./lib/load-exclusions.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCAN_ROOT = resolve(REPO_ROOT, "src");
const ALLOWED_FILES = new Set([
  "src/modules/config/env.ts",
  "src/modules/config/public-env.ts",
]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs"];
const NEEDLE = "process.env";

function findEnvReads(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  return lines.flatMap((line, index) =>
    line.includes(NEEDLE)
      ? [`${relative(REPO_ROOT, file)}:${index + 1}: ${line.trim()}`]
      : [],
  );
}

const isLegacyExcluded = loadExclusions(
  resolve(REPO_ROOT, "literal-exclusions.json"),
);
const candidates = listFiles(SCAN_ROOT, {
  extensions: SOURCE_EXTENSIONS,
}).filter((file) => {
  const path = relative(REPO_ROOT, file);
  return (
    !ALLOWED_FILES.has(path) &&
    !file.endsWith(".d.ts") &&
    !isLegacyExcluded(path)
  );
});
const hits = candidates.flatMap(findEnvReads);

if (hits.length > 0) {
  console.error(
    `check-env-reads: FAIL — ${hits.length} process.env read(s) outside ${[...ALLOWED_FILES].join(" / ")}`,
  );
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(
  `check-env-reads: OK — process.env is read only in ${[...ALLOWED_FILES].join(" / ")} (${candidates.length} file(s) scanned)`,
);
