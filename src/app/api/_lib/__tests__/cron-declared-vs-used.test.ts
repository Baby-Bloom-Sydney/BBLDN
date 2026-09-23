// Declared versus used, for crons (`ecc-lite` rule 3). `run-cron.test.ts` already holds the route files and
// `config/crons.ts` to one another; what it does not hold is the third list — the **handlers**. Thirteen of the
// twenty-four declared crons pass no handler and answer `no-handler-registered` by design, and "by design" is
// exactly how `08.43` came to sit written and unscheduled for a week: an expected-and-therefore-unread wall of
// alerts hides the one that stopped being expected.
//
// So the handler-less set is enumerated here with an owner apiece, and the assertion runs both ways: a cron added
// without a handler fails until someone writes down who owes it, and a cron that gains a handler fails until it is
// struck off. Neither direction can be satisfied by a comment.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { CRONS } from "@/modules/config";
import { SYSTEM_JOB_NAMES } from "@/modules/shared-types";

const ROUTE_DIR = "src/app/api/cron";

/**
 * Crons whose shell deliberately passes no handler yet, each against the unit that owes it. Every entry is a
 * `no-handler-registered` 500 in production today, which the runbook says not to page on — this list is the
 * complete account of what that wall is made of.
 */
const AWAITING_HANDLER: Readonly<Record<string, string>> = Object.freeze({
  "/api/cron/expire-connections":
    "Phase 1g `08.21` — the connections phase shipped without wiring its own sweep",
  "/api/cron/meeting-complete-sweep":
    "Phase 1g — K-12 INTRO_SCHEDULED → INTRO_COMPLETE (A-22)",
  "/api/cron/placement-start-sweep":
    "Phase 1g — L-1b CONFIRMED → ACTIVE + cascade K-21 (A-22)",
  "/api/cron/trial-complete-sweep":
    "Phase 1h — K-16 TRIAL_ARRANGED → TRIAL_COMPLETE (A-22)",
  "/api/cron/expire-subscribe-invites":
    "Phase 1h — subscribe_invites past expires_at (ADR-059, A-22)",
  "/api/cron/close-no-candidates":
    "Phase 1e — P-7 → CLOSED (no_candidates) (A-22)",
  "/api/cron/dfy-waves":
    "Phase 1e `08.25` — the matching phase shipped without wiring its own wave sweep",
  "/api/cron/usage-weekly-check":
    "Phase 2 — the results-guarantee usage check (ADR-088 G-D)",
});

/**
 * `4d`, on BAI's ruling of 2026-09-23 — the other half of the same account. These five sweep a phase that does
 * not exist: there is no Katie, no child-linking hygiene and no admin pipeline to sweep, so each was a
 * guaranteed `no-handler-registered` 500 **every day**, and a wall of daily failures that are all expected is
 * how the one that stops being expected goes unread.
 *
 * The job stays **owed** — named here against the phase that owes it, and `snapshot-pipeline` keeps its
 * `SystemJobName` in 03 §2.5 — but it is not scheduled and has no route file: `runCron` refuses an undeclared
 * path, so a route left behind would answer 500 to nothing at all, which is `ecc-lite` rule 3's own defect.
 *
 * The gate runs both ways here too. Putting one back into `config/crons.ts` fails the `AWAITING_HANDLER` check
 * above unless its handler is written at the same time, and leaving a route file behind fails the one-for-one
 * check below.
 */
const NOT_SCHEDULED: Readonly<Record<string, string>> = Object.freeze({
  "/api/cron/proactive": "Phase 5a `07.35` — Katie's proactive scheduler",
  "/api/cron/compact-daily": "Phase 5a `07.33` — Katie's daily chat compaction",
  "/api/cron/cleanup-orphan-children":
    "Phase 5c `07.56` — orphan child cleanup",
  "/api/cron/soft-lock-stale-children":
    "Phase 5c `07.55` — soft-lock stale children",
  "/api/cron/snapshot-pipeline":
    "Phase 6 — follows the `09.07` admin-pipeline rejig (call-queue counts)",
});

/** A shell hands its inside over as `runCron`'s third argument; one with none calls it with two. */
function hasHandler(path: string): boolean {
  const folder = path.split("/").pop();
  const source = readFileSync(`${ROUTE_DIR}/${folder}/route.ts`, "utf8");
  return !/runCron\(\s*request,\s*PATH\s*\)/u.test(source);
}

describe("every declared cron is either wired or owed to a named unit", () => {
  it("the handler-less set is exactly the recorded one — no unrecorded gap, no stale entry", () => {
    const handlerLess = CRONS.map((spec) => spec.path)
      .filter((path) => !hasHandler(path))
      .sort();

    expect(handlerLess).toEqual(Object.keys(AWAITING_HANDLER).sort());
  });

  it("every recorded gap names an owner", () => {
    for (const [path, owner] of Object.entries(AWAITING_HANDLER))
      expect(owner, path).toMatch(/Phase/u);
  });

  it("every cron that is wired is wired — the recorded list never hides a working job", () => {
    const wired = CRONS.map((spec) => spec.path).filter(hasHandler);

    expect(wired).toHaveLength(
      CRONS.length - Object.keys(AWAITING_HANDLER).length,
    );
    for (const path of wired) expect(AWAITING_HANDLER[path]).toBeUndefined();
  });
});

describe("the five BAI struck off the schedule are owed, unscheduled and gone from the tree", () => {
  it("names an owner apiece", () => {
    for (const [path, owner] of Object.entries(NOT_SCHEDULED))
      expect(owner, path).toMatch(/Phase/u);
  });

  it("none of them is declared — a re-added one must arrive with its handler", () => {
    const declared = CRONS.map((spec) => spec.path);
    for (const path of Object.keys(NOT_SCHEDULED))
      expect(declared, path).not.toContain(path);
  });

  it("none of them leaves a route file behind", () => {
    const folders = readdirSync(ROUTE_DIR);
    for (const path of Object.keys(NOT_SCHEDULED))
      expect(folders, path).not.toContain(path.split("/").pop());
  });

  it("`snapshot-pipeline` keeps its SystemJobName — struck off the schedule, not off 03 §2.5", () => {
    const names: ReadonlyArray<string> = SYSTEM_JOB_NAMES;
    expect(names).toContain("snapshot-pipeline");
  });
});

describe("no route file exists that nothing schedules, and nothing scheduled lacks a file", () => {
  it("matches one-for-one", () => {
    const declared = CRONS.map((spec) => spec.path.split("/").pop()).sort();

    expect(readdirSync(ROUTE_DIR).sort()).toEqual(declared);
  });
});

describe("every SystemJobName a cron declares is a name 03 §2.5 knows", () => {
  it("finds no cron job outside the list", () => {
    const names: ReadonlyArray<string> = SYSTEM_JOB_NAMES;
    for (const spec of CRONS)
      if (spec.job !== undefined) expect(names).toContain(spec.job);
  });
});
