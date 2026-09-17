// `payments` (03 §5.2) and its five scheduled jobs (01 §4f) — the real inside in every environment, over the
// spine store that reads and writes `parent_subscriptions` and `payment_events` through `auth`'s data port.
//
// Two bindings, one inside: a purchase method runs under a session on a request, a job under the service role on
// a cron's schedule, so they have different lifetimes and different entry points — but the same rules and the
// same store, which is what keeps a sweep from drifting from the spine it sweeps.
//
// `provider` is the module-level `purchaseProvider` binding rather than a provider object, so `wire-ports.ts`'s
// order between the two is not load-bearing: an unconfigured provider is a fail-closed `Result` at call time,
// not a null at wire time. Money amounts are never read here — every one comes from `PRICES` inside the rules
// (L4) — and `FLAGS.PAYMENTS` is read per call, not per boot, so the kill switch works without a redeploy.
import { auth } from "@/modules/auth";
import { URLS } from "@/modules/config";
import { FLAGS } from "@/modules/config/server";
import { comms } from "@/modules/comms";
import {
  configurePayments,
  configurePaymentsJobs,
  createPayments,
  createPaymentsJobs,
  dbSpineStore,
} from "@/modules/payments";
import { Events, nowInstant } from "@/modules/platform";
import { purchaseProvider } from "@/modules/purchase-paths";
import type { PortWiring } from "./types";

export function wirePayments(): PortWiring {
  const deps = {
    store: dbSpineStore(auth.data),
    provider: purchaseProvider,
    comms,
    events: Events,
    now: nowInstant,
    paymentsEnabled: () => FLAGS.PAYMENTS,
    newTrialsEnabled: () => FLAGS.NEW_TRIALS,
    appUrl: URLS.app,
  };
  configurePayments(createPayments(deps));
  configurePaymentsJobs(createPaymentsJobs(deps));
  return {
    port: "payments",
    binding: "db inside + jobs",
    reason:
      "02 §4.5's spine and ledger through auth's data port, keyed reads throughout (ADR-131 (1)); the webhook spine is an insert then an update and is deliberately NOT one unit of work (ADR-127 makes one RPC one transaction and this is two table writes) — payment_events.processed_at IS NULL is what the runbook reconciles from",
  };
}
