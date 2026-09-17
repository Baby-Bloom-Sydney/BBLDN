// `purchase-paths` (03 §5.2 / §5.5) — the swappable provider behind `payments`, chosen by `PURCHASE_PROVIDER`
// and never by an import edit (05 §3 rule 1).
//
// **This is the wiring P1-WIRE could not do**, and the reason it could not is gone rather than worked around:
// `stub-stripe` reached `node:crypto` from its constant-time compare, and `src/instrumentation.ts` is built for
// the edge runtime too (because `src/middleware.ts` makes one exist), so importing the stub from boot put a Node
// builtin in an edge bundle; splitting the boot on `NEXT_RUNTIME` was not available because `check:env-reads`
// forbids the read. The compare is now pure arithmetic (see that file's header), the stub touches no builtin,
// and the static import is safe in both runtimes. `check:bundle-secrets` and the client-boundary suite are the
// acceptance that it stayed that way.
//
// **`stripe-uk` is not installed** (N-2, ADR-022: no real Stripe account, no key, no payout logic on day one).
// Naming it leaves the registry on its fail-closed default with the reason on the boot report — never a silent
// fallback to the stub, which on a money seam would mean taking no money while reporting success.
//
// The stub's own layer-1 guard (`assertStubAllowed`) throws in a production-resolved environment. That throw is
// **not** caught here: 07 §5.5 says the boot fails, and `src/instrumentation.ts` turns a wiring throw into a
// non-zero exit. `config`'s env schema refuses the combination first, so reaching the throw means the schema was
// bypassed — exactly the case that must not degrade into a running server.
import type { Environment } from "@/modules/config";
import { configurePurchaseProvider } from "@/modules/purchase-paths";
import { stubStripe } from "@/modules/purchase-paths/providers/stub-stripe";
import type { PortWiring } from "./types";

const NOT_INSTALLED =
  "PURCHASE_PROVIDER names stripe-uk, which is not built (N-2 / ADR-022: no account, no key, no payout logic on day one); the registry stays fail-closed with provider-not-configured rather than falling back to the stub";

const NO_SECRET =
  "PURCHASE_PROVIDER is stub-stripe but STUB_EVENT_SECRET is absent; the registry stays fail-closed rather than running a provider whose events nothing can verify";

export function wirePurchaseProvider(
  provider: "stripe-uk" | "stub-stripe",
  environment: Environment,
  eventSecret: string | undefined,
  appUrl: string,
): PortWiring {
  if (provider === "stripe-uk")
    return {
      port: "purchase-paths",
      binding: "unconfigured",
      reason: NOT_INSTALLED,
    };
  if (eventSecret === undefined || eventSecret.trim() === "")
    return {
      port: "purchase-paths",
      binding: "unconfigured",
      reason: NO_SECRET,
    };
  configurePurchaseProvider(stubStripe({ eventSecret, environment, appUrl }));
  return {
    port: "purchase-paths",
    binding: "stub-stripe",
    reason:
      "the only provider that exists; it moves no money — link and checkout URLs are the real in-app screens and an admin click posts a synthesised event through the same handleWebhook as a real provider (03 §5.5)",
  };
}
