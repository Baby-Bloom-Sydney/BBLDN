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
 *
 * `4d` wired six of the eight it was sent to wire and **stopped on these two**, because neither is the wiring
 * it looked like from the census: neither drives a stage transition, and for neither does the thing it would
 * sweep exist inside a module yet. Each owner string now carries what was measured, so the next unit does not
 * re-derive it. Both are still scheduled, and so both still fail daily — whether they should come off the
 * schedule the way the other five did is BAI's to rule, not a unit's to extend.
 */
const AWAITING_HANDLER: Readonly<Record<string, string>> = Object.freeze({
  // Phase 1h, ADR-059, A-22. **Not a transition.** 02 §4's writers column names this job as a direct writer of
  // `subscribe_invites.status`, beside the nanny action and the webhook — there is no K / L / P row for it. And
  // no module owns the table: every reference in the tree is legacy Sydney
  // (`lib/actions/payments/createSubscribeInvite.ts`, `components/payments/SubscribeModalNanny.tsx`,
  // `app/subscribe-for/[token]`, `app/nanny/development/[childId]/layout.tsx`), which F-d has not ported. So
  // wiring it is either a cron writing a table directly, or building the subscribe-invite surface inside
  // `payments` first — feature work, not wiring, and it belongs to whoever ports that surface.
  "/api/cron/expire-subscribe-invites":
    "Phase 1h — subscribe_invites past expires_at (ADR-059, A-22); no module owns the table, no transition exists, the surface is still legacy",
  // Phase 2, ADR-088 G-D. **Nothing to count.** 02 §4.6 says the job counts `feed_posts` (+ `progress_history`)
  // per linked child over the London week; `app/child-development` exposes one export, `childAppGate`, and
  // nothing in the module tree reads either table — the only readers are the legacy chat modules over Sydney's
  // `bapp_*` schema, which is not `0012`'s. **And the document says not yet**: 02 §9 item 31 and 04 §6 item 36
  // both name BAI as owner with the trigger "before `usage-weekly-check` is written" (`usageLowThreshold` is a
  // placeholder 1, `[unverified]`). `ecc-lite` rule 4 — the document wins.
  "/api/cron/usage-weekly-check":
    "Phase 2 — the results-guarantee usage check (ADR-088 G-D); child-development has no store, and 02 §9 item 31 / 04 §6 item 36 owe BAI a ruling first",
});

/**
 * `4d`, on BAI's ruling of 2026-09-23 — the other half of the same account. These five sweep a phase that does
 * not exist: there is no Katie, no child-linking hygiene and no admin pipeline to sweep, so each was a
 * guaranteed `no-handler-registered` 500 **every day**, and a wall of daily failures that are all expected is
 * how the one that stops being expected goes unread.
 *
 * The job stays **declared and owed**: named here against the phase that owes it, `snapshot-pipeline` keeps its
 * `SystemJobName` in 03 §2.5, and **the route shell stays on disk**. The shell is the record of an endpoint a
 * later phase will fill, and it is also what `hasHandler` reads — deleting it would blind the gate above rather
 * than satisfy it. Only the `config/crons.ts` entry goes, so Vercel stops calling it.
 *
 * The gate runs both ways here too. Putting one back into `config/crons.ts` fails the `AWAITING_HANDLER` check
 * above unless its handler is written at the same time; deleting its shell fails the one-for-one check below;
 * and a route folder that is in neither list fails that check as well.
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

describe("the five BAI struck off the schedule are owed, unscheduled, and still on disk", () => {
  it("names an owner apiece", () => {
    for (const [path, owner] of Object.entries(NOT_SCHEDULED))
      expect(owner, path).toMatch(/Phase/u);
  });

  it("none of them is declared — a re-added one must arrive with its handler", () => {
    const declared = CRONS.map((spec) => spec.path);
    for (const path of Object.keys(NOT_SCHEDULED))
      expect(declared, path).not.toContain(path);
  });

  it("each keeps its shell, and each shell still registers no handler", () => {
    const folders = readdirSync(ROUTE_DIR);
    for (const path of Object.keys(NOT_SCHEDULED)) {
      expect(folders, path).toContain(path.split("/").pop());
      expect(hasHandler(path), path).toBe(false);
    }
  });

  it("`snapshot-pipeline` keeps its SystemJobName — struck off the schedule, not off 03 §2.5", () => {
    const names: ReadonlyArray<string> = SYSTEM_JOB_NAMES;
    expect(names).toContain("snapshot-pipeline");
  });
});

describe("no route file exists that is neither scheduled nor recorded, and nothing scheduled lacks a file", () => {
  it("matches one-for-one against the scheduled list plus the five recorded as owed", () => {
    const accounted = [
      ...CRONS.map((spec) => spec.path),
      ...Object.keys(NOT_SCHEDULED),
    ]
      .map((path) => path.split("/").pop())
      .sort();

    expect(readdirSync(ROUTE_DIR).sort()).toEqual(accounted);
  });
});

describe("every SystemJobName a cron declares is a name 03 §2.5 knows", () => {
  it("finds no cron job outside the list", () => {
    const names: ReadonlyArray<string> = SYSTEM_JOB_NAMES;
    for (const spec of CRONS)
      if (spec.job !== undefined) expect(names).toContain(spec.job);
  });
});
