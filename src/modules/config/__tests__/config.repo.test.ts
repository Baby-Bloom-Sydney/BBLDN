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

  it("renders a weekly London schedule as a UTC expression on the same weekday", () => {
    const block = renderCronBlock(
      CRONS.filter((cron) => cron.london.kind === "weekly"),
    );
    expect(block).toEqual([
      { path: "/api/cron/usage-weekly-check", schedule: "0 6 * * 1" },
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
  });
});
