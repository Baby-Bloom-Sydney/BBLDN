#!/usr/bin/env node
// check-action-limits.mjs — REVIEW-3 R-3 / M-1, the inverse of `check-limiter-call-sites.mjs`.
//
// ADR-142 (2)'s gate reads the **declaration** side: a policy in `config/security.ts` with no consumer. REVIEW-3
// found the other direction and found three of them at once — `saveVerificationContact`, `recordBiometricConsent`
// and `processVerification`, every one a `"use server"` export that writes, none of them naming a policy at all.
// A gate that only reads declarations is blind to that by construction, and on the evidence of two sweeps it is
// the commoner failure: nobody forgets to declare a limit they are already calling.
//
// **What this gate asserts.** Every server-action file reaches the platform rate-limit consume path, or is listed
// with a reason. A file is in scope when it is either
//   (a) `src/modules/**/actions/*.ts(x)` — the module convention for an action, or
//   (b) any scanned file whose **directive prologue** is `"use server"`, which makes every export of it an HTTP
//       endpoint. An *inline* `"use server"` inside a function body is not in scope: it is not an export, and the
//       page that closes over it is not a file this gate can speak about.
// It "reaches the consume path" when its code either calls `rateLimiter.consume(…)` or imports a `consume-*-limit`
// helper **and calls the name it imported**. Both halves are required: an unused import is not a control.
//
// **Comments and strings are not code** (`lib/code-only.mjs`), so `// consumeChildAddLimit(userId)` satisfies
// nothing — the same rule, and for the same reason, as the sibling gate's.
//
// **Scope, stated rather than assumed.** The legacy Sydney tree (`eslint.legacy-paths.json` — `src/lib/**` and
// friends) is excluded, as it is from `check:config-literals` and `check:env-reads`: F-d rewrites it, and fifty
// recorded exemptions would bury the London ones this gate exists to show. `src/app/**` and `src/modules/**` are
// in scope. Tests are never in scope: a test is not a surface.
//
// **The allow-list is a record, not an exemption.** A read-only action, or one whose limiter lives one boundary
// in (the three wizard submits consume 07 §8 row 11 inside `verification/lib/submit-*.ts`), carries its one-line
// reason under `"actions"` in `limiter-call-sites.allow.json`. A stale entry fails: if the file has since
// acquired a call site, or has gone, the record has outlived its reason and comes out.
//
// Reports check `limiter-call-sites` (same job). Exit 0 = every action is limited or recorded; 1 = listed.
import { readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./lib/list-files.mjs";
import { codeOnly } from "./lib/code-only.mjs";
import { globToRegExp } from "./lib/glob-to-regexp.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOW_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "limiter-call-sites.allow.json",
);
const LEGACY_PATHS = resolve(REPO_ROOT, "eslint.legacy-paths.json");
const SCAN_ROOT = resolve(REPO_ROOT, "src");
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const IS_TEST = /(^|[./])(test|spec)\.[jt]sx?$/;
const ACTION_FILE = /^src\/modules\/[^/]+(?:\/[^/]+)*\/actions\/[^/]+\.tsx?$/;

/** The `"use server"` directive prologue: the first statement of the module, after comments only. */
const DIRECTIVE =
  /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use server["']\s*;?/;

/** `import { a, b } from "…/consume-<something>-limit"` — the specifier is a string, so read it raw. */
const CONSUME_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*["'][^"']*\/(consume-[a-z0-9-]*-limit)["']/g;

function fail(message) {
  console.error(`check-action-limits: FAIL — ${message}`);
  process.exit(1);
}

/** @returns {RegExp[]} the legacy globs, as anchored regexps over repo-relative POSIX paths */
function legacyMatchers() {
  try {
    return JSON.parse(readFileSync(LEGACY_PATHS, "utf8")).map(globToRegExp);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }
}

/** Does this file's own code reach the consume path? */
function consumes(raw) {
  const code = codeOnly(raw);
  if (/\brateLimiter\s*\.\s*consume\s*\(/.test(code)) return true;
  for (const match of raw.matchAll(CONSUME_IMPORT)) {
    const names = match[1]
      .split(",")
      .map(
        (part) =>
          part
            .split(/\s+as\s+/)
            .at(-1)
            ?.trim() ?? "",
      )
      .filter((name) => name.length > 0);
    // The import alone is not a control: the name it brought in has to be **called** — either directly, or as
    // one method of a helper that exposes more than one (`consumeInviteLookupLimit.before(key)`, the two halves
    // of 07 §8 row 7's lookup budget).
    if (
      names.some((name) =>
        new RegExp(`\\b${name}\\s*(?:\\.\\s*[A-Za-z_$][\\w$]*\\s*)?\\(`).test(
          code,
        ),
      )
    )
      return true;
  }
  return false;
}

const legacy = legacyMatchers();
const isLegacy = (path) => legacy.some((matcher) => matcher.test(path));

/** @type {Record<string, string>} */
let allowed = {};
try {
  // The file is shared with `check-limiter-call-sites.mjs`; this gate owns the `actions` half only.
  allowed = JSON.parse(readFileSync(ALLOW_FILE, "utf8")).actions ?? {};
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const limited = [];
const unlimited = [];
const seen = new Set();
for (const file of listFiles(SCAN_ROOT, { extensions: SOURCE_EXTENSIONS })) {
  const path = relative(REPO_ROOT, file);
  if (IS_TEST.test(path) || path.includes("/__tests__/")) continue;
  if (isLegacy(path)) continue;
  const raw = readFileSync(file, "utf8");
  if (!ACTION_FILE.test(path) && !DIRECTIVE.test(raw)) continue;
  seen.add(path);
  (consumes(raw) ? limited : unlimited).push(path);
}

if (seen.size === 0)
  fail(
    "no server actions found under src/ — the gate cannot read its own subject, and a gate that cannot read it must not pass",
  );

const unrecorded = unlimited.filter((path) => allowed[path] === undefined);
const unknownAllowances = Object.keys(allowed).filter(
  (path) => !seen.has(path),
);
const staleAllowances = Object.keys(allowed).filter((path) =>
  limited.includes(path),
);

for (const path of unrecorded)
  console.error(
    `check-action-limits: FAIL — ${path} is a server action that never reaches the rate-limit consume path (ADR-142 (2); REVIEW-3 M-1). Consume a policy from SECURITY.rateLimits, or add the file to "actions" in scripts/ci/limiter-call-sites.allow.json with the reason it needs none.`,
  );
for (const path of unknownAllowances)
  console.error(
    `check-action-limits: FAIL — limiter-call-sites.allow.json's "actions" names "${path}", which this gate does not scan (gone, renamed, a test, or in the legacy tree). Remove it.`,
  );
for (const path of staleAllowances)
  console.error(
    `check-action-limits: FAIL — limiter-call-sites.allow.json's "actions" still excuses "${path}", which now consumes a limit. Remove the entry.`,
  );

if (unrecorded.length + unknownAllowances.length + staleAllowances.length > 0)
  process.exit(1);

console.log(
  `check-action-limits: OK — ${limited.length} of ${seen.size} server actions consume a rate-limit policy; ${unlimited.length} recorded with a reason`,
);
