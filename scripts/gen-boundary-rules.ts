#!/usr/bin/env node
// gen-boundary-rules.ts — writes `eslint.boundaries.js` from the allowed-imports table of
// `01-architecture.md` §2.3, or with `--check` fails when the committed file differs (05 §7 rule 1, §10).
// Runs under plain Node (type stripping), like the `.env.example` and `vercel.json` generators beside it.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkResult } from "./boundaries/lib/check-result.ts";
import { renderBoundaryConfig } from "./boundaries/lib/render-boundary-config.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = resolve(REPO_ROOT, "eslint.boundaries.js");
const isCheck = process.argv.includes("--check");

const expected = renderBoundaryConfig();

if (isCheck) {
  let current = "";
  try {
    current = readFileSync(TARGET, "utf8");
  } catch {
    console.error(
      "check:allowed-imports: FAIL — eslint.boundaries.js is missing; run `npm run gen:boundary-rules` and commit it (05 §10)",
    );
    process.exit(1);
  }
  const result = checkResult(current, expected);
  if (result.ok) {
    console.log(result.message);
    process.exit(0);
  }
  console.error(result.message);
  process.exit(1);
}

writeFileSync(TARGET, expected);
console.log(
  "gen:boundary-rules: wrote eslint.boundaries.js from the 01 §2.3 allowed-imports table",
);
