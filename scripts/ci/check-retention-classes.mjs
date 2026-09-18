#!/usr/bin/env node
// ADR-179's gate: **a retention class the erasure job preserves, with no entry in `config/legal.ts`, is a gate
// failure and not a documentation choice.**
//
// The two sides it joins are the only two that can disagree in a way a person would feel:
//
//   * `LEGAL.erasureRetains` — the *sentences* a person is shown before she confirms, one per class, each with
//     its 07 §6.2 row and its Art 17(3) basis.
//   * `erase_account()`'s `v_retained` array — the classes the job actually keeps.
//
// A class added to the job and not to the list is a thing we keep and never tell her about, which is an Art 12
// failure wearing the shape of a TODO. A class in the list and not in the job is a promise the job does not make.
// Neither is visible by reading either file alone, which is exactly why this is a gate.
//
// It is a text scan rather than an import on purpose: the SQL side is a migration, not a module, and the point is
// to compare what is *written* in the two files. No database is needed, so it runs in `config-gates` beside the
// other cheap ones.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const LEGAL = resolve(REPO_ROOT, "src/modules/config/legal.ts");
const MIGRATION = resolve(
  REPO_ROOT,
  "supabase/migrations/0028_erasure-job.sql",
);

/** `class: "money",` … in the `erasureRetains` array. */
function configClasses(source) {
  const block = source.slice(source.indexOf("erasureRetains:"));
  return [...block.matchAll(/class:\s*"([a-z-]+)"/g)].map((m) => m[1]);
}

/** `v_retained constant text[] := array['money', 'consent', 'safeguarding'];` */
function sqlClasses(source) {
  const match =
    /v_retained\s+constant\s+text\[\]\s*:=\s*array\[([^\]]*)\]/.exec(source);
  if (match === null) return null;
  return [...match[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
}

export function compareRetentionClasses() {
  const config = configClasses(readFileSync(LEGAL, "utf8"));
  const sql = sqlClasses(readFileSync(MIGRATION, "utf8"));
  return { config, sql };
}

function main() {
  const { config, sql } = compareRetentionClasses();
  if (sql === null) {
    console.error(
      "check-retention-classes: FAIL — erase_account() has no `v_retained` array. The job must name the classes it keeps so this gate can join them to LEGAL.erasureRetains (ADR-179).",
    );
    process.exit(1);
  }
  if (config.length === 0) {
    console.error(
      "check-retention-classes: FAIL — LEGAL.erasureRetains names no class. A zero-class scan is a failure, not a pass.",
    );
    process.exit(1);
  }
  const missingFromConfig = sql.filter((c) => !config.includes(c));
  const missingFromSql = config.filter((c) => !sql.includes(c));
  if (missingFromConfig.length > 0) {
    console.error(
      `check-retention-classes: FAIL — erase_account() keeps ${missingFromConfig.join(", ")} and LEGAL.erasureRetains does not say so. A class we keep and never tell the person about is an Art 12 failure (ADR-179).`,
    );
    process.exit(1);
  }
  if (missingFromSql.length > 0) {
    console.error(
      `check-retention-classes: FAIL — LEGAL.erasureRetains promises ${missingFromSql.join(", ")} and erase_account() does not keep it. The sentence would be untrue.`,
    );
    process.exit(1);
  }
  console.log(
    `check-retention-classes: OK — the erasure job and LEGAL.erasureRetains name the same ${config.length} classes (${config.join(", ")})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
