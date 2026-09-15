#!/usr/bin/env node
// generate-example.mts — writes `.env.example` from the env registry, or with `--check` fails when the committed file
// differs (06 §2.5 "CI fails on drift"; reports check `banned-literals` — HANDOFF §9). Runs under plain Node (type
// stripping); imports only the registry (type-only imports inside) and the pure renderer.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_SCHEMA } from "../../src/modules/config/lib/env-schema.ts";
import { renderEnvExample } from "./lib/render-env-example.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET = resolve(REPO_ROOT, ".env.example");
const isCheck = process.argv.includes("--check");
const expected = renderEnvExample(ENV_SCHEMA);
const nameCount = Object.keys(ENV_SCHEMA.entries).length;

function readCurrent(): string | null {
  try {
    return readFileSync(TARGET, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}

if (isCheck) {
  const current = readCurrent();
  if (current === expected) {
    console.log(
      `env:check: OK — .env.example matches the schema (${nameCount} names)`,
    );
    process.exit(0);
  }
  console.error(
    current === null
      ? "env:check: FAIL — .env.example is missing; run `npm run env:example`"
      : "env:check: FAIL — .env.example drifted from src/modules/config/lib/env-schema.ts; run `npm run env:example` and commit",
  );
  process.exit(1);
}

writeFileSync(TARGET, expected);
console.log(`env:example: wrote .env.example (${nameCount} names)`);
