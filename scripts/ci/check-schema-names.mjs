#!/usr/bin/env node
// check-schema-names.mjs — **a table, view, column, RPC or bucket name the schema does not have fails a gate.**
//
// ── The defect this closes, and why it is a class rather than one bug ──
//
// `/parent` was broken for every London parent: `src/lib/actions/parent.ts`'s `getPosition` filtered
// `.in("status", …)` on `nanny_positions`, London's stage model replaced that column with `stage`, PostgREST
// answered `42703`, and `src/app/parent/page.tsx` rendered its error card before the hub could mount. Sydney's
// schema *does* have `status` and Sydney's code matches it — the file was carried across unchanged and is still
// called by a London page. Nothing in the pipeline could see it, because a PostgREST name is a **string**: the
// compiler does not read it, the linter does not read it, and the first reader is the database, at request time.
//
// ── What already works, and where the gate is calibrated ──
//
// `src/modules/` and `src/boot/` query through `Query<AppDatabase>` (`shared-types/platform.ts`), which is
// generic over the **generated** `database.types.ts`: `from` takes a `ReadableName`, `select` / `eq` / `insert`
// / `update` take `keyof` the generated row, `rpc` takes a `RpcName`. A wrong name there is a compile error, and
// the measurement says so — of 195 wrong identifiers in this tree, **zero** are in those two directories. Bucket
// names are likewise a closed union (`BucketKey`) declared in `config/uploads.ts`.
//
// So this gate is not a second source of truth for names. It is the same source — the generated types — applied
// to the tree the compiler cannot reach: the legacy Supabase clients in `src/lib/supabase/*`, which are built
// with no `Database` generic and therefore check nothing. Two jobs:
//
//   1. `src/modules/` + `src/boot/` must stay clean. A raw untyped client appearing there is how this class
//      comes back, and this is what refuses it.
//   2. The legacy tree is **ratcheted**, the way `eslint.long-functions.json` and `eslint.typed-ratchet.json`
//      are: every file that names something the schema lacks is recorded with its identifiers and a reason, and
//      **the list may only shrink**. A new wrong name in a recorded file fails; a recorded name that is now
//      correct fails as stale; a recorded file that no longer exists fails. The record cannot outlive its reason.
//
// ── Driven the other way, in the same run ──
//
// Two gates in this repo shipped green and vacuous until somebody drove them against a real violation, so before
// this one reads a line of `src/` it analyses `gate-fixtures/schema-names.violations.fixture.ts` and asserts the
// **exact** expected findings, and `schema-names.clean.fixture.ts` and asserts **none**. Exact counts, not "at
// least one": a check that quietly narrows keeps firing once and stops catching the case that matters.
//
// No database: it reads the checked-in generated types, which `types-drift` holds to the real schema. Reports
// check `config-gates`. Exit 0 = the owned tree is clean and the record is exact; 1 = listed.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./lib/list-files.mjs";
import { databaseCatalogue } from "./lib/database-catalogue.mjs";
import { schemaReferences } from "./lib/schema-references.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const TYPES_FILE = resolve(
  REPO_ROOT,
  "src/modules/shared-types/database.types.ts",
);
const UPLOADS_CONFIG = resolve(REPO_ROOT, "src/modules/config/uploads.ts");
const RATCHET_FILE = resolve(HERE, "schema-names.ratchet.json");
const FIXTURES = resolve(HERE, "gate-fixtures");
const SCAN_ROOT = resolve(REPO_ROOT, "src");
const OWNED = ["src/modules/", "src/boot/"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const IS_TEST = /(^|[./])(test|spec)\.tsx?$/;

// What the violations fixture must report, case by case. The comment names the reference it reconstructs.
const EXPECTED_FIXTURE = [
  "nanny_positions.status", // the London defect: the table exists, the column was replaced by `stage`
  "parents.verification_level", // a column named in a write
  "bapp_milestones", // an unported Sydney table
  "rpc:sydney_only_function", // an RPC the schema does not define
  "bucket:hire-pdfs", // a bucket outside BucketKey / UPLOADS.buckets
];

const failures = [];
const fail = (message) => failures.push(message);
const die = (message) => {
  console.error(`check-schema-names: FAIL — ${message}`);
  process.exit(1);
};

// ── The catalogue: the names the schema has ──
const catalogue = databaseCatalogue(TYPES_FILE);
const readable = { ...catalogue.tables, ...catalogue.views };
if (Object.keys(catalogue.tables).length === 0)
  die(
    `no tables parsed out of ${relative(REPO_ROOT, TYPES_FILE)} — the generated file's shape has changed, and a catalogue with no tables would pass every file in the repo. Fix lib/database-catalogue.mjs before this check runs again.`,
  );

// Bucket names are a closed set declared in config (01 §6.1; 07 §5.3 rule 5), not in the generated types.
const bucketSource = readFileSync(UPLOADS_CONFIG, "utf8");
const bucketsAt = bucketSource.indexOf("buckets: Object.freeze({");
const buckets = new Set(
  bucketsAt === -1
    ? []
    : [
        ...bucketSource.slice(bucketsAt).matchAll(/^\s{4}"([a-z0-9-]+)":/gm),
      ].map((m) => m[1]),
);
if (buckets.size === 0)
  die(
    "no bucket names parsed out of src/modules/config/uploads.ts — every storage reference would pass. Fix the parse, not the config.",
  );

/** The identifier a reference is wrong about, or `null` if the schema has it. */
function offence(reference) {
  if (reference.kind === "table")
    return reference.name in readable ? null : reference.name;
  if (reference.kind === "column") {
    if (!(reference.table in readable)) return null; // the table is reported on its own
    return readable[reference.table].includes(reference.name)
      ? null
      : `${reference.table}.${reference.name}`;
  }
  if (reference.kind === "rpc")
    return catalogue.functions.includes(reference.name)
      ? null
      : `rpc:${reference.name}`;
  if (reference.kind === "bucket")
    return buckets.has(reference.name) ? null : `bucket:${reference.name}`;
  return null;
}

const offencesIn = (file, source) => {
  const names = new Set();
  for (const reference of schemaReferences(file, source)) {
    const name = offence(reference);
    if (name !== null) names.add(name);
  }
  return names;
};

// ── Driven the other way, before anything else ──
for (const [fixture, expected] of [
  ["schema-names.violations.fixture.ts", EXPECTED_FIXTURE],
  ["schema-names.clean.fixture.ts", []],
]) {
  const path = resolve(FIXTURES, fixture);
  if (!existsSync(path))
    die(
      `${relative(REPO_ROOT, path)} is missing. Without its fixtures this check cannot show that it fires, and a check that cannot show that is a claim — it must not pass.`,
    );
  const got = [...offencesIn(path, readFileSync(path, "utf8"))].sort();
  const want = [...expected].sort();
  if (JSON.stringify(got) !== JSON.stringify(want))
    die(
      `driving the gate against ${fixture} reported [${got.join(", ")}], expected [${want.join(", ")}]. Either the analyser has narrowed — in which case it has stopped catching the case that matters — or a case was added without its assertion. Fix whichever it is; never fix the fixture to match a gate that shrank.`,
    );
}

// ── The tree ──
/** @type {Record<string, { identifiers: string[], reason: string }>} */
let ratchet = {};
try {
  ratchet = JSON.parse(readFileSync(RATCHET_FILE, "utf8"));
  delete ratchet["//"];
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const measured = new Map();
for (const file of listFiles(SCAN_ROOT, { extensions: SOURCE_EXTENSIONS })) {
  const path = relative(REPO_ROOT, file);
  if (IS_TEST.test(path) || path.includes("/__tests__/")) continue;
  const names = offencesIn(file, readFileSync(file, "utf8"));
  if (names.size > 0) measured.set(path, [...names].sort());
}

for (const [path, names] of measured) {
  const owned = OWNED.some((prefix) => path.startsWith(prefix));
  if (owned) {
    fail(
      `${path} names ${names.join(", ")}, which the schema does not have. This tree queries through \`Query<AppDatabase>\`, where a wrong name is a compile error — so this file is reaching the database some other way. Route it through \`auth\`'s data port rather than recording it; the ratchet is for the legacy tree only.`,
    );
    continue;
  }
  const recorded = ratchet[path];
  if (recorded === undefined) {
    fail(
      `${path} names ${names.join(", ")}, which the schema does not have, and it is not in scripts/ci/schema-names.ratchet.json. Fix the name against src/modules/shared-types/database.types.ts, or record the file with the reason it cannot be fixed yet.`,
    );
    continue;
  }
  const added = names.filter((name) => !recorded.identifiers.includes(name));
  if (added.length > 0)
    fail(
      `${path} has acquired ${added.join(", ")}, which the schema does not have and its record does not cover. The recorded list may only shrink: fix the name rather than widening the entry.`,
    );
}

for (const [path, recorded] of Object.entries(ratchet)) {
  const names = measured.get(path);
  if (names === undefined) {
    fail(
      `scripts/ci/schema-names.ratchet.json records ${path}, which now names nothing the schema lacks (or no longer exists). Remove the entry — a record that outlives its reason is the stale list this gate exists to avoid.`,
    );
    continue;
  }
  if (typeof recorded.reason !== "string" || recorded.reason.trim() === "")
    fail(
      `scripts/ci/schema-names.ratchet.json's entry for ${path} carries no reason.`,
    );
  const gone = recorded.identifiers.filter((name) => !names.includes(name));
  if (gone.length > 0)
    fail(
      `scripts/ci/schema-names.ratchet.json still excuses ${gone.join(", ")} in ${path}, which the file no longer names. Remove them from the entry.`,
    );
}

for (const message of failures)
  console.error(`check-schema-names: FAIL — ${message}`);
if (failures.length > 0) process.exit(1);

const recordedFiles = Object.keys(ratchet).length;
const recordedNames = Object.values(ratchet).reduce(
  (n, e) => n + e.identifiers.length,
  0,
);
console.log(
  `check-schema-names: OK — ${Object.keys(catalogue.tables).length} tables, ${Object.keys(catalogue.views).length} views, ${catalogue.functions.length} functions and ${buckets.size} buckets are the catalogue; src/modules/ + src/boot/ name nothing outside it; ${recordedNames} legacy identifiers across ${recordedFiles} files recorded with a reason`,
);
