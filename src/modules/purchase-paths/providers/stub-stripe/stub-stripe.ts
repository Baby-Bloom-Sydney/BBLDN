// `stub-stripe` — the local / preview purchase provider (03 §5.5). It moves no money and calls no Stripe SDK:
// link and checkout URLs are in-app pages that render the real S-P-10 / S-P-11 with a stub payment panel, and an
// admin click synthesises a `PurchaseEvent` that is posted through the **same** `handleWebhook` as a real
// provider, so the record, the events and the access gate run for real.
//
// The three guards of 07 §5.5: (1) `assertStubAllowed` refuses to construct in a production-resolved
// environment; (2) `config`'s env schema refuses `PURCHASE_PROVIDER = stub-stripe` there too; (3) `parseEvent`
// fails closed unless the caller presents `STUB_EVENT_SECRET`, compared in constant time, and the route that
// calls it re-checks `auth.requireRole('admin')`.
import { err, ok } from "@/modules/platform";
import type { Environment } from "@/modules/config";
import type { CustomerRef, LinkRef, Url } from "@/modules/shared-types";
import type {
  PurchaseEvent,
  PurchaseProvider,
  PurchaseResult,
} from "../../types";
import { assertStubAllowed } from "./lib/assert-stub-allowed";
import { constantTimeEquals } from "./lib/constant-time-equals";
import { STUB_EVENT_SCHEMA } from "./lib/stub-event-schema";

/** The in-app destinations 03 §5.5 names; they render the real screens with the stub panel. */
const LINK_PATH = "/parent/bundle";
const CHECKOUT_PATH = "/parent/subscribe";
const CUSTOMER_PREFIX = "stub:";

export type StubStripeOptions = {
  /** `STUB_EVENT_SECRET` — required whenever the stub is the provider (07 §5.5 item 2). */
  readonly eventSecret: string;
  /** The resolved environment (ADR-108); `production` refuses construction. */
  readonly environment: Environment;
  /** `URLS.app` — the one base URL (01 §3.1); never a literal host. */
  readonly appUrl: string;
};

const unverified = () =>
  err("VALIDATION", "Stub provider event is not verified", {
    reason: "signature-invalid" as const,
    provider: "stub-stripe",
  });

function withRef(base: string, path: string, ref: LinkRef): Url {
  const url = new URL(path, `${base.replace(/\/$/, "")}/`);
  url.searchParams.set("ref", ref);
  return url.toString() as Url;
}

function parseBody(rawBody: string): PurchaseResult<PurchaseEvent> {
  const json: unknown = (() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return undefined;
    }
  })();
  if (json === undefined) return unverified();
  const parsed = STUB_EVENT_SCHEMA.safeParse(json);
  if (!parsed.success) return unverified();
  return ok(parsed.data as unknown as PurchaseEvent);
}

export function stubStripe(options: StubStripeOptions): PurchaseProvider {
  assertStubAllowed(options.environment);
  const { eventSecret, appUrl } = options;
  // Declared, then frozen — the annotation contextually types every method below (see
  // `payments/lib/default-payments.ts`).
  const provider: PurchaseProvider = {
    name: "stub-stripe",
    ensureCustomer: async (family) =>
      ok(`${CUSTOMER_PREFIX}${family.id}` as CustomerRef),
    // The stub takes no money, so amount, kind, plan and expiry reach no provider: the link is an in-app page
    // that renders the real S-P-10 with the stub panel, keyed by the `LinkRef` **payments** minted.
    createPaymentLink: async (_customer, _amount, _kind, _plan, ref) =>
      ok({ url: withRef(appUrl, LINK_PATH, ref) }),
    createCheckout: async (_customer, _preset, _plan, ref) =>
      ok({ url: withRef(appUrl, CHECKOUT_PATH, ref) }),
    parseEvent: (raw) =>
      constantTimeEquals(raw.signature, eventSecret)
        ? parseBody(raw.rawBody)
        : unverified(),
    portal: async () => ok({ url: `${appUrl}${CHECKOUT_PATH}` as Url }),
  };
  return Object.freeze(provider);
}
