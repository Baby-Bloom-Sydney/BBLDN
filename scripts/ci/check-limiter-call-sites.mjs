#!/usr/bin/env node
// check-limiter-call-sites.mjs — ADR-140 (2) / ADR-142 (2): **a control declared in config with no call site
// fails a gate.** REVIEW-2 found four rate-limit policies declared in `config/security.ts` with zero consumers
// while the file read as protection in force — which is worse than an absent control, because a reader (and a
// reviewer) counts it as one. So every policy name declared under `SECURITY.rateLimits` must be consumed
// somewhere outside `src/modules/config/`, or be listed with a reason in `limiter-call-sites.allow.json`.
//
// A **test is not a consumer**: a policy referenced only from a `*.test.*` / `*.spec.*` file or `__tests__/`
// satisfies nobody, so those files are not scanned. The allow-list is for a policy 07 §8 names whose surface
// does not exist in Phase 1 — it is a recorded gap, and a stale entry (a policy that *has* acquired a call site)
// fails too, so the file cannot quietly outlive its reason.
//
// Reports check `limiter-call-sites`. Exit 0 = every declared policy is consumed or recorded; 1 = listed.
import { readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./lib/list-files.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SECURITY_CONFIG = resolve(REPO_ROOT, "src/modules/config/security.ts");
const ALLOW_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "limiter-call-sites.allow.json",
);
const SCAN_ROOT = resolve(REPO_ROOT, "src");
const CONFIG_DIR = resolve(REPO_ROOT, "src/modules/config");
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const IS_TEST = /(^|[./])(test|spec)\.[jt]sx?$/;
const DECLARATION = "declarePolicies({";

/** The `{ … }` that starts at `from`, by brace depth — never a regex, so a nested object cannot end the block. */
function objectBodyAt(source, from) {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(from + 1, i);
    }
  }
  return null;
}

/** The keys declared at depth 1 of the policy object — the names `SECURITY.rateLimits.*` is read by. */
function declaredPolicyNames(body) {
  const names = [];
  let depth = 0;
  for (const line of body.split("\n")) {
    const match = depth === 0 ? /^\s{2}([A-Za-z][\w]*):/.exec(line) : null;
    if (match) names.push(match[1]);
    for (const character of line) {
      if (character === "{" || character === "[") depth += 1;
      else if (character === "}" || character === "]") depth -= 1;
    }
  }
  return names;
}

function fail(message) {
  console.error(`check-limiter-call-sites: FAIL — ${message}`);
  process.exit(1);
}

const source = readFileSync(SECURITY_CONFIG, "utf8");
const declarationAt = source.indexOf(DECLARATION);
if (declarationAt === -1)
  fail(
    `no \`${DECLARATION}\` block in src/modules/config/security.ts — the gate cannot read the declared policies, and a gate that cannot read them must not pass`,
  );
const body = objectBodyAt(source, declarationAt + DECLARATION.length - 1);
if (body === null)
  fail("the declarePolicies({ … }) block in security.ts is unbalanced");

const declared = declaredPolicyNames(body);
if (declared.length === 0)
  fail("security.ts declares no rate-limit policies — that cannot be right");

/** @type {Record<string, string>} */
let allowed = {};
try {
  allowed = JSON.parse(readFileSync(ALLOW_FILE, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const consumers = new Map(declared.map((name) => [name, []]));
for (const file of listFiles(SCAN_ROOT, { extensions: SOURCE_EXTENSIONS })) {
  if (file.startsWith(`${CONFIG_DIR}/`)) continue;
  if (IS_TEST.test(file) || file.includes("/__tests__/")) continue;
  const text = readFileSync(file, "utf8");
  for (const name of declared)
    if (text.includes(`rateLimits.${name}`))
      consumers.get(name).push(relative(REPO_ROOT, file));
}

const uncalled = declared.filter(
  (name) => consumers.get(name).length === 0 && allowed[name] === undefined,
);
const unknownAllowances = Object.keys(allowed).filter(
  (name) => !declared.includes(name),
);
const staleAllowances = Object.keys(allowed).filter(
  (name) => (consumers.get(name)?.length ?? 0) > 0,
);

for (const name of uncalled)
  console.error(
    `check-limiter-call-sites: FAIL — SECURITY.rateLimits.${name} is declared but nothing outside src/modules/config/ consumes it (ADR-142 (2)). Wire its surface, or add it to scripts/ci/limiter-call-sites.allow.json with the reason it has none.`,
  );
for (const name of unknownAllowances)
  console.error(
    `check-limiter-call-sites: FAIL — limiter-call-sites.allow.json names "${name}", which is not a declared policy. Remove it.`,
  );
for (const name of staleAllowances)
  console.error(
    `check-limiter-call-sites: FAIL — limiter-call-sites.allow.json still excuses "${name}", which now has a call site (${consumers.get(name).join(", ")}). Remove the entry.`,
  );

if (uncalled.length + unknownAllowances.length + staleAllowances.length > 0)
  process.exit(1);

const recorded = Object.keys(allowed).length;
console.log(
  `check-limiter-call-sites: OK — ${declared.length - recorded} of ${declared.length} declared policies have a call site; ${recorded} recorded with a reason`,
);
