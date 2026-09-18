// Gate 1 of the seed's production refusal: **where am I running, and what am I pointed at?**
//
// A seed that can run against production is a defect, not a convenience, so this is fail-closed on both axes
// and neither axis trusts the other:
//
//   - the **environment signal** is the one the boot itself reads (`resolveEnvironment`, 06 §2.1) — imported,
//     never re-implemented, so a change to what "production" means cannot leave the seed behind;
//   - the **target** is an allow-list, not a deny-list. A deny-list of production refs is one new project away
//     from being wrong and silent; an allow-list is wrong loudly. The default allows the local stack only, so
//     seeding `bb-ldn-preview` is a deliberate act that names the ref (06 §4.2: BAI applies to preview).
//
// Pure: the caller hands in the environment and the URL, so `int.seed` can walk every road without a process.
import { resolveEnvironment } from "../../../src/modules/config/lib/resolve-environment.ts";
import type { Refusal } from "./types.ts";

/** `supabase start`'s host, and the loopback names a laptop reaches it by. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "db.localhost"]);

/** Comma-separated project refs a human has decided this machine may seed. Empty = local stack only. */
const ALLOW_LIST_NAME = "BBLDN_SEED_ALLOWED_PROJECT_REFS";

function hostOf(dbUrl: string): string {
  try {
    return new URL(dbUrl).hostname;
  } catch {
    return "";
  }
}

function allowedRefs(
  env: Readonly<Record<string, string | undefined>>,
): ReadonlyArray<string> {
  return (env[ALLOW_LIST_NAME] ?? "")
    .split(",")
    .map((ref) => ref.trim())
    .filter((ref) => ref.length > 0);
}

/**
 * Every reason this run must not proceed, given the process environment and the database URL. An empty array
 * is the only "go"; the caller prints the rest and exits non-zero.
 */
export function targetRefusals(
  env: Readonly<Record<string, string | undefined>>,
  dbUrl: string,
): ReadonlyArray<Refusal> {
  const refusals: Refusal[] = [];
  if (resolveEnvironment(env) === "production")
    refusals.push({
      code: "PRODUCTION_ENVIRONMENT",
      reason:
        "the environment resolves to production (06 §2.1) — the seed writes people and production has none",
    });
  const host = hostOf(dbUrl);
  const isLocal = LOCAL_HOSTS.has(host);
  const named = allowedRefs(env).some(
    (ref) => host.includes(ref) || dbUrl.includes(ref),
  );
  if (!isLocal && !named)
    refusals.push({
      code: "REMOTE_TARGET_NOT_ALLOWED",
      reason: `the target is not the local stack and no project ref in it is named by ${ALLOW_LIST_NAME}`,
    });
  return refusals;
}
