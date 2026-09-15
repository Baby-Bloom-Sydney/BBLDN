#!/usr/bin/env node
// check-env-reads.mjs — `process.env` is read in exactly one file:
// src/modules/config/env.ts (01 §1.3 rule 1; 05 §6 "env" row; 07 §7; 07 §10.2).
// Reports check `banned-literals` (HANDOFF §9). Exit 0 = clean; 1 = hits listed.
import { readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./lib/list-files.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCAN_ROOT = resolve(REPO_ROOT, "src");
const ALLOWED_FILE = "src/modules/config/env.ts";
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

const candidates = listFiles(SCAN_ROOT, {
  extensions: SOURCE_EXTENSIONS,
}).filter(
  (file) =>
    relative(REPO_ROOT, file) !== ALLOWED_FILE && !file.endsWith(".d.ts"),
);
const hits = candidates.flatMap(findEnvReads);

if (hits.length > 0) {
  console.error(
    `check-env-reads: FAIL — ${hits.length} process.env read(s) outside ${ALLOWED_FILE}`,
  );
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(
  `check-env-reads: OK — process.env is read only in ${ALLOWED_FILE}`,
);
