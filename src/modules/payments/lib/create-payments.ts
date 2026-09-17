// The money inside, composed (03 §5.2). Nothing here is a rule: the rules live in the five method groups and in
// the pure dispatch table beside them, and every one of them is handed the **same** `PaymentsDeps` — the store,
// the provider, comms, events, the clock and the two flags. That is what makes 03 §11 row 4's swap test
// meaningful: swap the store and the rules are unchanged; swap the provider and the record is unchanged.
//
// `prices()` is the one method with no group, because it has no I/O: it renders the presets `config` states
// (L4 — never a literal), and the two per-family presets (`balance-after-week-1`, `custom`) are absent by
// construction, since their amount is computed from the family's own row.
import type { PurchasePath } from "../types";
import { accessMethods } from "./access-methods";
import type { PaymentsDeps } from "./deps";
import { dfyMethods } from "./dfy-methods";
import { linkMethods } from "./link-methods";
import { presetPrices } from "./preset-prices";
import { trialMethods } from "./trial-methods";
import { webhookMethod } from "./webhook-method";

export function createPayments(deps: PaymentsDeps): PurchasePath {
  const path: PurchasePath = {
    ...linkMethods(deps),
    ...accessMethods(deps),
    ...trialMethods(deps),
    ...dfyMethods(deps),
    ...webhookMethod(deps),
    prices: presetPrices,
  };
  return Object.freeze(path);
}
