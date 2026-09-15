#!/usr/bin/env node
// scan-client-bundle.mjs — bundle string scan after `next build` (05 §9 stage 7;
// 07 §7 item 3; AC-X-35 / AC-X-36). Two assertions over the client chunks:
//   1. no server-only secret NAME appears in any client chunk;
//   2. the stub purchase-provider string never reaches a production build.
// Reports check `build` (HANDOFF §9). Exit 0 = clean; 1 = hits listed.
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./lib/list-files.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLIENT_CHUNKS = resolve(REPO_ROOT, ".next/static");
const STUB_PROVIDER = "stub-stripe";
// The ten server-only names of 07 §7 item 3.
const SERVER_ONLY_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "RESEND_API_KEY", "OPENAI_API_KEY",
  "GOOGLE_AI_API_KEY", "META_CAPI_ACCESS_TOKEN", "CRON_SECRET", "ADMIN_API_TOKEN",
  "STRIPE_WEBHOOK_SECRET", "STUB_EVENT_SECRET",
];

function findStrings(file, needles) {
  const content = readFileSync(file, "utf8");
  return needles.filter((needle) => content.includes(needle)).map((needle) => `${relative(REPO_ROOT, file)}: ${needle}`);
}

if (!existsSync(CLIENT_CHUNKS)) {
  console.error(`scan-client-bundle: FAIL — ${relative(REPO_ROOT, CLIENT_CHUNKS)} not found; run 'next build' first`);
  process.exit(1);
}

const chunks = listFiles(CLIENT_CHUNKS, { extensions: [".js"], skipDirs: [] });
const secretHits = chunks.flatMap((chunk) => findStrings(chunk, SERVER_ONLY_NAMES));
const stubHits = chunks.flatMap((chunk) => findStrings(chunk, [STUB_PROVIDER]));

if (secretHits.length > 0) {
  console.error("scan-client-bundle: FAIL — server-only secret name(s) present in client chunks (AC-X-36):");
  for (const hit of secretHits) console.error(`  ${hit}`);
}
if (stubHits.length > 0) {
  console.error(`scan-client-bundle: FAIL — '${STUB_PROVIDER}' present in client chunks (AC-X-35):`);
  for (const hit of stubHits) console.error(`  ${hit}`);
}
if (secretHits.length > 0 || stubHits.length > 0) process.exit(1);
console.log(`scan-client-bundle: OK — ${chunks.length} client chunk(s); no server-only names, no '${STUB_PROVIDER}'`);
