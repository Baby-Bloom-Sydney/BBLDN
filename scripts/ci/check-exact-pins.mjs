#!/usr/bin/env node
// check-exact-pins.mjs — every dependency in package.json is pinned to an exact
// version and the lockfile is committed (07 §10.2 "dependency pinning";
// HANDOFF §9 "sec" row → check `gitleaks`). Exit 0 = clean; 1 = offenders listed.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PACKAGE_JSON = resolve(REPO_ROOT, "package.json");
const LOCKFILE = resolve(REPO_ROOT, "package-lock.json");
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
];
// Exact semver: 1.2.3 or 1.2.3-tag.1 — no ^ ~ > < * x ranges, no "latest".
const EXACT_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readPackageJson() {
  try {
    return JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `check-exact-pins: FAIL — cannot read package.json (${reason})`,
    );
    process.exit(1);
  }
}

function findUnpinned(packageJson) {
  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries(packageJson[field] ?? {})
      .filter(([, version]) => !EXACT_VERSION.test(version))
      .map(([name, version]) => `${field}: ${name}@${version}`),
  );
}

if (!existsSync(LOCKFILE)) {
  console.error(
    "check-exact-pins: FAIL — package-lock.json is missing (lockfile must be committed)",
  );
  process.exit(1);
}

const unpinned = findUnpinned(readPackageJson());
if (unpinned.length > 0) {
  console.error(
    `check-exact-pins: FAIL — ${unpinned.length} dependenc${unpinned.length === 1 ? "y is" : "ies are"} not pinned to an exact version:`,
  );
  for (const line of unpinned) console.error(`  ${line}`);
  process.exit(1);
}
console.log(
  "check-exact-pins: OK — every dependency is pinned exactly and the lockfile is present",
);
