#!/usr/bin/env node
// generate.mts — writes the `crons` block of vercel.json from config/crons.ts, or with `--check` fails when the
// committed block differs (01 §4f "vercel.json is generated from it"; 06 §4.1 C pre-flight). Every other key of
// vercel.json (regions …) is preserved. Runs under plain Node (type stripping).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CRONS } from "../../src/modules/config/crons.ts";
import { renderCronBlock } from "./lib/render-cron-block.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET = resolve(REPO_ROOT, "vercel.json");
const isCheck = process.argv.includes("--check");

function readVercelJson(): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(TARGET, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("vercel.json must be a JSON object");
  return parsed as Record<string, unknown>;
}

const current = readVercelJson();
const next = { ...current, crons: renderCronBlock(CRONS) };
const expectedText = `${JSON.stringify(next, null, 2)}\n`;
const currentText = readFileSync(TARGET, "utf8");

if (isCheck) {
  if (currentText === expectedText) {
    console.log(
      `crons:check: OK — vercel.json cron block matches config/crons.ts (${CRONS.length} crons)`,
    );
    process.exit(0);
  }
  console.error(
    "crons:check: FAIL — vercel.json cron block drifted from src/modules/config/crons.ts; run `npm run crons:generate` and commit",
  );
  process.exit(1);
}

writeFileSync(TARGET, expectedText);
console.log(
  `crons:generate: wrote vercel.json cron block (${CRONS.length} crons)`,
);
