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
// 07 §6.1 step 6's job reads the same list to decide whether a subject may be hard-deleted (L-009 `3g`), so the
// gate now has a third side: every class must also carry a **window** and the **anchor** it runs from. A class
// with a sentence and no window is a promise the purge cannot check, and the purge would refuse for ever
// without anyone knowing why.
const PURGE = resolve(
  REPO_ROOT,
  "supabase/migrations/0030_purge-scrubbed-users.sql",
);
// L-009 `3h`: ADR-179's words are about a *retention class*, not only about the three an erasure keeps — "a
// retention class added to 07 §6.2 without a config entry is a gate failure". So the gate has two more sides.
// `config/retention.ts` is 07 §6.2's whole seventeen-row table as a value, and `0031` is the sweep that acts on
// it; a row with no entry is a class nothing sweeps and nobody learns, and an arm the schedule does not name
// (or a schedule entry with no arm) is a sweep that raises nightly or silently does nothing.
const SCHEDULE = resolve(REPO_ROOT, "src/modules/config/retention.ts");
const SWEEP = resolve(
  REPO_ROOT,
  "supabase/migrations/0031_retention-sweep.sql",
);

/** `class: "money",` … in the `erasureRetains` array. */
function configClasses(source) {
  const block = source.slice(source.indexOf("erasureRetains:"));
  return [...block.matchAll(/class:\s*"([a-z-]+)"/g)].map((m) => m[1]);
}

/** Each entry, as `{ class, hasWindow, hasAnchor }` — the shape 07 §6.1 step 6's job needs to do its check. */
function configEntries(source) {
  const block = source.slice(source.indexOf("erasureRetains:"));
  return [...block.matchAll(/class:\s*"([a-z-]+)"([\s\S]*?)\}\),/g)].map(
    ([, name, body]) => ({
      class: name,
      hasWindow: /windowMonths:\s*\S/.test(body),
      hasAnchor: /from:\s*"(scrub|last-activity)"/.test(body),
    }),
  );
}

/** The classes `purge_scrubbed_user()` demands a window for. */
function purgeClasses(source) {
  const match = /foreach v_class in array array\[([^\]]*)\]/.exec(source);
  if (match === null) return null;
  return [...match[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
}

/** `v_retained constant text[] := array['money', 'consent', 'safeguarding'];` */
function sqlClasses(source) {
  const match =
    /v_retained\s+constant\s+text\[\]\s*:=\s*array\[([^\]]*)\]/.exec(source);
  if (match === null) return null;
  return [...match[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
}

/** 07 §6.2's rows the schedule names, and the classes it gives a real treatment. */
function scheduleRows(source) {
  const block = source.slice(source.indexOf("schedule: Object.freeze(["));
  return [...block.matchAll(/specRow:\s*(\d+)/g)].map((m) => Number(m[1]));
}

/** A class is *acting* when its treatment removes or nulls something; `none` and `deferred` do neither. */
function actingClasses(source) {
  const block = source.slice(source.indexOf("schedule: Object.freeze(["));
  return [...block.matchAll(/class:\s*"([a-z-]+)"([\s\S]*?)\n    \}\),/g)]
    .filter(([, , body]) => /kind:\s*"(delete|null-columns)"/.test(body))
    .map(([, name]) => name);
}

/** The `when '<class>' then` arms `0031` actually implements. */
function sweepArms(source) {
  const body = source.slice(source.indexOf("case p_class"));
  const arms = [...body.matchAll(/^\s{4}when '([a-z-]+)' then$/gm)].map(
    (m) => m[1],
  );
  return arms.length === 0 ? null : arms;
}

export function compareRetentionSchedule() {
  const schedule = readFileSync(SCHEDULE, "utf8");
  return {
    rows: scheduleRows(schedule),
    acting: actingClasses(schedule),
    arms: sweepArms(readFileSync(SWEEP, "utf8")),
  };
}

export function compareRetentionClasses() {
  const legal = readFileSync(LEGAL, "utf8");
  const config = configClasses(legal);
  const sql = sqlClasses(readFileSync(MIGRATION, "utf8"));
  const entries = configEntries(legal);
  const purge = purgeClasses(readFileSync(PURGE, "utf8"));
  return { config, sql, entries, purge };
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
  // ── the third side (L-009 `3g`): every class must carry a window and an anchor, and the purge must demand
  //    exactly the same set. A class the purge checks but the list does not describe is a date in SQL.
  const { entries, purge } = compareRetentionClasses();
  const windowless = entries.filter((e) => !e.hasWindow).map((e) => e.class);
  const anchorless = entries.filter((e) => !e.hasAnchor).map((e) => e.class);
  if (windowless.length > 0) {
    console.error(
      `check-retention-classes: FAIL — ${windowless.join(", ")} has a sentence and no windowMonths. purge-scrubbed-users (07 §6.1 step 6) reads this list to decide whether a subject may be hard-deleted; a class with no window is a promise it cannot check (ADR-179).`,
    );
    process.exit(1);
  }
  if (anchorless.length > 0) {
    console.error(
      `check-retention-classes: FAIL — ${anchorless.join(", ")} has no \`from\` anchor ("scrub" or "last-activity"). Money runs from the last transaction and consent from the scrub (07 §6.2 rows 9 and 11); a job that assumed one anchor would be wrong for the other and would look right.`,
    );
    process.exit(1);
  }
  if (purge === null) {
    console.error(
      "check-retention-classes: FAIL — purge_scrubbed_user() names no class array. The job must state which windows it demands so this gate can join them to LEGAL.erasureRetains (ADR-179).",
    );
    process.exit(1);
  }
  const purgeExtra = purge.filter((c) => !config.includes(c));
  const purgeMissing = config.filter((c) => !purge.includes(c));
  if (purgeExtra.length > 0 || purgeMissing.length > 0) {
    console.error(
      `check-retention-classes: FAIL — purge_scrubbed_user() and LEGAL.erasureRetains disagree (job-only: ${purgeExtra.join(", ") || "none"}; list-only: ${purgeMissing.join(", ") || "none"}). The purge must check every class the list promises, and no class the list does not describe.`,
    );
    process.exit(1);
  }

  // ── the fourth and fifth sides (L-009 `3h`): 07 §6.2's whole table, and the sweep that acts on it.
  const { rows, acting, arms } = compareRetentionSchedule();
  const SPEC_ROWS = Array.from({ length: 17 }, (_, i) => i + 1);
  const uncovered = SPEC_ROWS.filter((row) => !rows.includes(row));
  if (uncovered.length > 0) {
    console.error(
      `check-retention-classes: FAIL — 07 §6.2 row(s) ${uncovered.join(", ")} have no entry in config/retention.ts. A retention class with no config entry is a gate failure, not a documentation choice (ADR-179): retention-sweep would silently do nothing about it.`,
    );
    process.exit(1);
  }
  if (arms === null) {
    console.error(
      "check-retention-classes: FAIL — 0031 names no class arms. The sweep must state which classes it implements so this gate can join them to the schedule.",
    );
    process.exit(1);
  }
  const armOnly = arms.filter((name) => !acting.includes(name));
  const scheduleOnly = acting.filter((name) => !arms.includes(name));
  if (armOnly.length > 0 || scheduleOnly.length > 0) {
    console.error(
      `check-retention-classes: FAIL — retention_sweep_class() and config/retention.ts disagree (job-only: ${armOnly.join(", ") || "none"}; schedule-only: ${scheduleOnly.join(", ") || "none"}). An arm the schedule does not give a treatment is dead code the cron never calls; a class the schedule acts on with no arm makes the sweep raise every night.`,
    );
    process.exit(1);
  }

  console.log(
    `check-retention-classes: OK — the erasure job, the purge and LEGAL.erasureRetains name the same ${config.length} classes (${config.join(", ")}), each with a window and an anchor; config/retention.ts covers all 17 rows of 07 §6.2 and its ${acting.length} acting classes are exactly retention_sweep_class()'s arms`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
