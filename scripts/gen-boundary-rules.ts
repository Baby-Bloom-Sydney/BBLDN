#!/usr/bin/env node
// gen-boundary-rules.ts — writes `eslint.boundaries.js` from the allowed-imports table of
// `01-architecture.md` §2.3, or with `--check` fails when the committed file differs (05 §7 rule 1, §10).
// Runs under plain Node (type stripping), like the `.env.example` and `vercel.json` generators beside it.
//
// `--check` is two gates, and says which ran:
//   1. parity — `scripts/boundaries/allowed-imports.ts` against §2.3 itself, where the sibling `LDN/` tree is
//      checked out (ADR-107). In CI it is not, so the step prints a NOTICE naming the gap rather than passing
//      silently.
//   2. drift  — the committed `eslint.boundaries.js` against a fresh generation.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { architectureParity } from "./boundaries/lib/architecture-parity.ts";
import { checkResult } from "./boundaries/lib/check-result.ts";
import { renderBoundaryConfig } from "./boundaries/lib/render-boundary-config.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = resolve(REPO_ROOT, "eslint.boundaries.js");
const ARCHITECTURE = resolve(
  REPO_ROOT,
  "../LDN/SPECS/00-foundations/01-architecture.md",
);

/** The file's text, or `null` when it is genuinely absent; any other read failure is an error, not a skip. */
function readOptional(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

const expected = renderBoundaryConfig();

if (!process.argv.includes("--check")) {
  writeFileSync(TARGET, expected);
  console.log(
    "gen:boundary-rules: wrote eslint.boundaries.js from the 01 §2.3 allowed-imports table",
  );
  process.exit(0);
}

const parity = architectureParity(readOptional(ARCHITECTURE));
console.log(parity.message);
if (!parity.ok) process.exit(1);

const current = readOptional(TARGET);
if (current === null) {
  console.error(
    "check:allowed-imports: FAIL — eslint.boundaries.js is missing; run `npm run gen:boundary-rules` and commit it (05 §10)",
  );
  process.exit(1);
}

const result = checkResult(current, expected);
console.log(result.ok ? result.message : "");
if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}
