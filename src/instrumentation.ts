// The boot file (Next's `instrumentation` hook). **Its one job today is to make the environment fail the boot
// rather than the first request** — which is what turns 07 §5.5's env guard into a real gate: a production start
// with `PURCHASE_PROVIDER = stub-stripe` must exit non-zero (`check:prod-guard`), and it can only do that if
// something parses `env` at start-up. `config/env.ts` parses once at module load, so importing it here is the
// whole mechanism; `ALERT_ENV_INVALID` is the 01 §4b hook the runbook alerts on (07 §7.1).
//
// **What it deliberately does NOT do, and why** (S4's ★ gap, still open — `docs/build-progress.md`):
//   · `configureUnitOfWork` needs a transaction opener. Supabase-js has no client-side transaction, so `pg` or
//     an RPC-per-transaction is a **KEY decision that must be an ADR before the boot file opens one**. Wiring
//     `memoryTransactionOpener` meanwhile would turn `platform`'s deliberate fail-closed into a silent success
//     against a stub.
//   · `configureEvents` / `configureConsent` need that opener to write inside the caller's transaction.
//   · `configureRateLimiter(limiter, "shared")` needs the `rate_limit_buckets` store to exist and be reachable.
//   · `configurePurchaseProvider` is not called here either: the only provider that exists is `stub-stripe`, and
//     reaching it from this file would place `node:crypto` in the **edge** instrumentation bundle (this hook
//     runs once per runtime, and `src/middleware.ts` makes an edge runtime exist). Until the boot file is
//     runtime-split, the purchase registry stays unconfigured and every payment call fails closed — which is the
//     honest state while `payments` has no inside.
// Each is recorded in the L-005 F-c PROGRESS entry rather than guessed at.
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
  } catch (error) {
    // Names only. Without them an on-call engineer sees the alert fire and has no idea which variable failed.
    log.error("boot: environment is invalid", {
      action: "boot",
      alert: "ALERT_ENV_INVALID",
      envNames: invalidEnvNames(error),
    });
    // **The boot must fail, not degrade.** Next 14 catches a throwing `register()`, keeps the process alive and
    // serves 500s from every route — a server that is up but cannot answer, which reads to an orchestrator as
    // "healthy enough to keep in rotation". 07 §5.5 item 2 and §7.1 say the boot fails, and `check:prod-guard`
    // encodes that as a non-zero exit, so this exits rather than returning. The edge runtime has no
    // `process.exit`; there, rethrowing is the strongest signal available.
    if (typeof process !== "undefined" && typeof process.exit === "function")
      process.exit(1);
    throw error;
  }
}
