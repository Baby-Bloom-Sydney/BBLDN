// Everything the money inside needs from outside itself, as one injected object (03 §11 row 4: swap either half).
// The boot follow-up builds it from the real ports; the tests build it from the memory store and fakes. Nothing
// here is read from a module-level binding inside the rules, so a rule can never silently run on a stub.
import type { Comms } from "@/modules/comms";
import type { EventsConnector } from "@/modules/platform";
import type { PurchaseProvider } from "@/modules/purchase-paths";
import type { Instant } from "@/modules/shared-types";
import type { SpineStore } from "./spine-store";

export type PaymentsDeps = {
  readonly store: SpineStore;
  readonly provider: PurchaseProvider;
  /**
   * ★ ADR-160 — `send` for her messages, `notifyAdmin` for the operator's row. `payments` may not reach past
   * `comms` (01 §2.3) and `comms` is the one send seam, so the row joins the seam rather than getting a second
   * one: "`payment_due` stays payments' to call".
   */
  readonly comms: Pick<Comms, "send" | "notifyAdmin">;
  readonly events: Pick<EventsConnector, "emit">;
  readonly now: () => Instant;
  /** `FLAGS.PAYMENTS` — the kill switch (`06.11`); off ⇒ every link and checkout is `E_PAYMENTS_DISABLED`. */
  readonly paymentsEnabled: () => boolean;
  /** `FLAGS.NEW_TRIALS` — passed to the trial RPC, which reads it rather than the flag (0010 header). */
  readonly newTrialsEnabled: () => boolean;
  /** `URLS.app` — where a hosted checkout returns to (S-P-12). */
  readonly appUrl: string;
};
