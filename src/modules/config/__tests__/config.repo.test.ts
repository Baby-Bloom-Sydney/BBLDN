// Repo-level drift checks of the config layer (HANDOFF §5.4, 01 §4f, 01 §1.3 rule 1): `.env.example` and the
// vercel.json cron block are generated artefacts; the environment is read only by the two config readers.
import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CRONS } from "@/modules/config";
import { ENV_SCHEMA } from "@/modules/config/lib/env-schema";
import { renderCronBlock } from "../../../../scripts/crons/lib/render-cron-block";
import { renderEnvExample } from "../../../../scripts/env/lib/render-env-example";
import { listFiles } from "../../../../scripts/ci/lib/list-files.mjs";
import { loadExclusions } from "../../../../scripts/ci/lib/load-exclusions.mjs";

const REPO_ROOT = resolve(__dirname, "../../../..");
const READERS = new Set([
  "src/modules/config/env.ts",
  "src/modules/config/public-env.ts",
]);
// Assembled so this file does not itself contain the needle the env-reads check greps for.
const ENV_READ = ["process", "env"].join(".");

describe("config — generated artefacts match their source", () => {
  it(".env.example equals the render of the env registry (npm run env:check)", () => {
    expect(readFileSync(resolve(REPO_ROOT, ".env.example"), "utf8")).toBe(
      renderEnvExample(ENV_SCHEMA),
    );
  });

  it(".env.example carries names only — no `NAME=value`", () => {
    const assignments = readFileSync(resolve(REPO_ROOT, ".env.example"), "utf8")
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line));
    expect(assignments.length).toBe(Object.keys(ENV_SCHEMA.entries).length);
    expect(assignments.every((line) => line.endsWith("="))).toBe(true);
  });

  it("vercel.json's cron block equals the render of config/crons.ts (npm run crons:check)", () => {
    const vercel = JSON.parse(
      readFileSync(resolve(REPO_ROOT, "vercel.json"), "utf8"),
    ) as { crons: unknown; regions: unknown };
    expect(vercel.crons).toEqual(renderCronBlock(CRONS));
    expect(vercel.regions).toEqual(["lhr1"]);
  });

  // Was `0 6 * * 1`, which is Monday 06:00 London only through GMT and Monday 07:00 through BST — the naive
  // offset 01 §4f rules out ("the UTC expression is chosen so the London time stays inside the acceptable window
  // in both GMT and BST"). Both candidate hours are scheduled and the due-gate discards the wrong one (`4b`).
  it("renders a weekly London schedule as both candidate UTC hours on the same weekday", () => {
    const block = renderCronBlock(
      CRONS.filter((cron) => cron.london.kind === "weekly"),
    );
    expect(block).toEqual([
      { path: "/api/cron/usage-weekly-check", schedule: "0 5,6 * * 1" },
    ]);
  });
});

describe("config — the environment is read only by the two readers (01 §1.3 rule 1)", () => {
  it("finds no other read under src/ once the legacy tree (literal-exclusions.json) is excluded", () => {
    const isLegacy = loadExclusions(
      resolve(REPO_ROOT, "literal-exclusions.json"),
    );
    const offenders = listFiles(resolve(REPO_ROOT, "src"), {
      extensions: [".ts", ".tsx", ".mts", ".js", ".mjs"],
    })
      .map((file) => relative(REPO_ROOT, file))
      .filter(
        (path) =>
          !READERS.has(path) && !isLegacy(path) && !path.endsWith(".d.ts"),
      )
      .filter((path) =>
        readFileSync(resolve(REPO_ROOT, path), "utf8").includes(ENV_READ),
      );
    expect(offenders).toEqual([]);
    expect(
      listFiles(resolve(REPO_ROOT, "src/modules"), { extensions: [".ts"] })
        .length,
    ).toBeGreaterThan(20);
  });
});

/**
 * L-009 `3e` (Q-4) — **the gate that carries ADR-172's safety rule must live in a job that can be required.**
 *
 * `check:config-literals` is the mechanism behind ADR-172 (4): it is what stops a wrong child-safety
 * instruction returning to the tree after `3c` deleted seventy of them. It passed — inside `banned-literals`,
 * whose `check:banned-words` step is red on `main` by construction (ADR-124) until F-d rewrites the legacy
 * parent surfaces. A job that is expected to be red cannot be a required check, so the safety control was
 * green and nobody was obliged to look.
 *
 * The fix is a split by colour, and these cases are what keep it split: a later edit that folds the config
 * gates back in beside `banned-words` fails here rather than silently un-requiring them again.
 *
 * **The split worked and `config-gates` is now a required check** — the eighth context on `main`'s branch
 * protection, verified against the protection API (L-009 `3g`). So these cases guard a live requirement rather
 * than an aspiration: folding the steps back would not merely hide them, it would move a control out from
 * behind a merge gate that exists today.
 */
describe("ci — the green gates are not in a job that is allowed to be red (Q-4)", () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, ".github/workflows/ci.yml"),
    "utf8",
  );

  /** The steps of one job, by its `jobname:` key at two-space indentation. */
  function jobBody(name: string): string {
    const start = workflow.indexOf(`\n  ${name}:\n`);
    expect(start, `job ${name} is missing from ci.yml`).toBeGreaterThan(-1);
    const rest = workflow.slice(start + 1);
    const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/);
    return next === -1 ? rest : rest.slice(0, next);
  }

  it("★ `config-gates` runs check:config-literals — the job that carries the safeguarding rule", () => {
    expect(jobBody("config-gates")).toContain("npm run check:config-literals");
  });

  it("★ and it does NOT run check:banned-words, which is red until F-d", () => {
    expect(jobBody("config-gates")).not.toContain("npm run check:banned-words");
  });

  it("★ banned-literals keeps the red step and nothing else, so its colour says only one thing", () => {
    const body = jobBody("banned-literals");
    expect(body).toContain("npm run check:banned-words");
    expect(body).not.toContain("npm run check:config-literals");
    expect(body).not.toContain("npm run env:check");
    expect(body).not.toContain("npm run crons:check");
    expect(body).not.toContain("npm run check:env-reads");
  });

  it("the three other green gates moved with it, not left behind", () => {
    const body = jobBody("config-gates");
    for (const step of [
      "npm run env:check",
      "npm run crons:check",
      "npm run check:env-reads",
    ]) {
      expect(body).toContain(step);
    }
  });

  // ADR-179's gate joined the job in L-009 `3f`. A gate nobody has driven is a claim, not a control — and a gate
  // in no job at all is not even a claim, which is the failure mode `3e` split this job out to end.
  it("★ and ADR-179's retention-class gate runs here too", () => {
    expect(jobBody("config-gates")).toContain(
      "npm run check:retention-classes",
    );
  });
});

/**
 * ADR-179 — the gate itself, driven rather than trusted. It joins two files that can disagree in a way nobody
 * reading either one would notice: the classes `erase_account()` keeps, and the sentences `LEGAL.erasureRetains`
 * shows a person before she confirms. Both directions are failures, and both are asserted.
 */
describe("check:retention-classes — the job and the list say the same thing (ADR-179)", () => {
  it("agrees today, on the real files", async () => {
    const { compareRetentionClasses } =
      await import("../../../../scripts/ci/check-retention-classes.mjs");
    const { config, sql } = compareRetentionClasses();
    expect(sql).not.toBeNull();
    expect([...config].sort()).toEqual([...(sql ?? [])].sort());
    expect(config).toContain("safeguarding");
  });

  // ── L-009 `3h` widened the gate to 07 §6.2's whole table, because ADR-179's own words are about a *retention
  //    class*, not only about the three an erasure keeps: "a retention class added to 07 §6.2 without a config
  //    entry is a gate failure, not a documentation choice". Two more sides, each a way the tree can go wrong
  //    without either file looking wrong on its own.
  it("★ every one of 07 §6.2's seventeen rows has a schedule entry", async () => {
    const { compareRetentionSchedule } =
      await import("../../../../scripts/ci/check-retention-classes.mjs");
    const { rows } = compareRetentionSchedule();
    const missing = Array.from({ length: 17 }, (_, i) => i + 1).filter(
      (row) => !rows.includes(row),
    );
    expect(missing).toEqual([]);
  });

  it("★ the sweep's arms and the schedule's acting classes are the same set", async () => {
    const { compareRetentionSchedule } =
      await import("../../../../scripts/ci/check-retention-classes.mjs");
    const { acting, arms } = compareRetentionSchedule();
    expect(arms).not.toBeNull();
    expect([...acting].sort()).toEqual([...(arms ?? [])].sort());
  });
});
