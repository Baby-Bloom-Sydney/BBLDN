// The boot file (Next's `instrumentation` hook; 03 §9.5 "injected at boot in src/instrumentation.ts"). Two jobs,
// in order, and it **exits** if either fails rather than degrading:
//
//   1. Make the environment fail the boot rather than the first request. `config/env.ts` parses once at module
//      load, so importing it here is the whole mechanism behind 07 §5.5's env guard (`check:prod-guard`);
//      `ALERT_ENV_INVALID` is the 01 §4b hook the runbook alerts on (07 §7.1).
//   2. Wire every port that has a real inside (`src/boot/wire-ports.ts`, ADR-127): the unit of work over the
//      RPC-boundary opener, `auth` joined to it, the event-log and consent stores over `auth`'s port, and the
//      `areas` · `comms` · `scheduling` seams — each binding chosen by env, never by an import edit (05 §3 rule 1).
//      One log line per port says what was bound and, where a port stays on its fail-closed default, why.
//
// **What boot leaves closed is on the report, not in this comment** (REVIEW-2, code-review HIGH-2). The list
// that used to sit here had gone stale in both directions — it still named the `"shared"` rate limiter and the
// stage-model slices, which `wire-rate-limiter.ts` and `wire-connections.ts` / `wire-placements.ts` now wire,
// and it omitted three of the four ports that really are left closed. A hand-maintained list of open gaps is a
// list that drifts the moment a gap closes, so the four are stated in `src/boot/unwired-ports.ts`, travel on the
// boot report beside every bound port, and are pinned by `boot.test.ts`. Read the log, not this header.
//
// `configurePurchaseProvider` **is** wired now (`1h`, `src/boot/wire-purchase-paths.ts`). Its reason for not
// being — `stub-stripe` reaching `node:crypto`, which this hook would have carried into the edge bundle — was
// removed at the source rather than worked around: the stub's constant-time compare is pure arithmetic and the
// folder touches no Node builtin.
/**
 * `EnvInvalidError` carries a frozen `names` array and **never a value** — that is the whole point of its shape
 * (`config/lib/env-invalid-error.ts`). It is read structurally rather than by importing the class, because the
 * `config` connector does not export it and a boot file should not deep-import another module's `lib/`.
 */
function invalidEnvNames(error: unknown): ReadonlyArray<string> | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const names = (error as { readonly names?: unknown }).names;
  if (!Array.isArray(names)) return undefined;
  return names.filter((name): name is string => typeof name === "string");
}

/**
 * **The boot must fail, not degrade.** Next 14 catches a throwing `register()`, keeps the process alive and serves
 * 500s from every route — a server that is up but cannot answer, which reads to an orchestrator as "healthy enough
 * to keep in rotation". 07 §5.5 item 2 and §7.1 say the boot fails, and `check:prod-guard` encodes that as a
 * non-zero exit, so this exits rather than returning. The edge runtime has no `process.exit`; there, rethrowing
 * is the strongest signal available.
 */
function failBoot(error: unknown): never {
  if (typeof process !== "undefined" && typeof process.exit === "function")
    process.exit(1);
  throw error;
}

export async function register(): Promise<void> {
  const { log } = await import("@/modules/platform");
  try {
    const { env } = await import("@/modules/config/server");
    const { configureLog } = await import("@/modules/platform");
    configureLog({
      // 01 §4b: JSON lines to stdout, `debug` dev-only.
      format: "json",
      minLevel: env.environment === "development" ? "debug" : "info",
    });
    log.info("boot: environment validated", {
      action: "boot",
      environment: env.environment,
    });
    const { wirePorts } = await import("@/boot/wire-ports");
    for (const wiring of wirePorts(env))
      log.info("boot: port wired", { action: "boot", ...wiring });
  } catch (error) {
    // Names only — under a key the PII scrubber does not claim (`envNames` matched `name(e?s)?` and was
    // redacted, E1 finding 4). Without them an on-call engineer sees the alert fire and has no idea which
    // variable failed. `errorName` (a class name, never a message or value) is what tells an env failure
    // from a wiring throw once the process has exited (security review, P1-WIRE MEDIUM-1).
    log.error("boot: environment is invalid or the ports could not be wired", {
      action: "boot",
      alert: "ALERT_ENV_INVALID",
      invalidEnvVars: invalidEnvNames(error),
      errorName: error instanceof Error ? error.name : typeof error,
    });
    failBoot(error);
  }
}
