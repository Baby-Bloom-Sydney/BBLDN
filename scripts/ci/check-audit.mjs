#!/usr/bin/env node
// check-audit.mjs — `npm audit --audit-level=high` with an EXPIRING allow-list
// (07 §10.2; HANDOFF §9 "sec" row → check `gitleaks`). A high / critical advisory
// passes only while a matching, unexpired entry exists in scripts/ci/audit-allowlist.json;
// an expired entry fails the check even if the advisory is gone. Exit 0 = clean; 1 = listed.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOWLIST = resolve(REPO_ROOT, "scripts/ci/audit-allowlist.json");
const GATED_SEVERITIES = new Set(["high", "critical"]);
const TODAY = new Date().toISOString().slice(0, 10);
const AUDIT_TIMEOUT_MS = 120_000; // a hung registry call fails the check instead of hanging CI

function runAudit() {
  // npm exits non-zero when it finds anything; the JSON report is on stdout either way.
  try {
    return JSON.parse(
      execSync("npm audit --json", {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: AUDIT_TIMEOUT_MS,
      }),
    );
  } catch (error) {
    if (
      error &&
      typeof error.stdout === "string" &&
      error.stdout.trim().startsWith("{")
    )
      return JSON.parse(error.stdout);
    throw error;
  }
}

function loadAllowlist() {
  return JSON.parse(readFileSync(ALLOWLIST, "utf8"));
}

function gatedVulnerabilities(report) {
  return Object.values(report.vulnerabilities ?? {}).filter((entry) =>
    GATED_SEVERITIES.has(entry.severity),
  );
}

const allowlist = loadAllowlist();
const expired = allowlist.filter((entry) => entry.expires < TODAY);
const live = new Map(
  allowlist
    .filter((entry) => entry.expires >= TODAY)
    .map((entry) => [entry.package, entry]),
);
const unallowed = gatedVulnerabilities(runAudit()).filter(
  (entry) => !live.has(entry.name),
);

for (const entry of expired)
  console.error(
    `check-audit: EXPIRED allow-list entry ${entry.package} (expired ${entry.expires}; owner ${entry.owner})`,
  );
for (const entry of unallowed)
  console.error(
    `check-audit: ${entry.severity} ${entry.name} ${entry.range} — not allow-listed`,
  );

if (expired.length > 0 || unallowed.length > 0) {
  console.error(
    `check-audit: FAIL — ${unallowed.length} unallowed high/critical advisor${unallowed.length === 1 ? "y" : "ies"}, ${expired.length} expired allow-list entr${expired.length === 1 ? "y" : "ies"}`,
  );
  process.exit(1);
}
console.log(
  `check-audit: OK — no unallowed high/critical advisories (${live.size} allow-listed until their expiry)`,
);
