// **ADR-144 — an empty list of shapes is an outage, not an answer.** S-P-11's one read of `prices()`.
//
// `prices()` keeps its synchronous, non-`Result` signature (03 §5.2: the presets are computed from `PRICES` in
// config, not fetched from the provider), so the unconfigured registry's `[]` is the one method on that object
// that is not a coded refusal. Reaching the pay page it rendered HTTP 200 with a correct-looking standing panel
// and no way to pay — no log, no alert, no 5xx, and indistinguishable from "we took this road away" (REVIEW-2
// H-13). The ruling puts the judgement here rather than in the contract: an empty answer is `E_PROVIDER`, it
// raises `ALERT_PROVIDER_DOWN`, and the screen renders the payments-unavailable state.
//
// The alert name is 01 §4b's closest true one — the money provider is not answering with anything usable. L-6
// already records that `ALERT_NAMES` has no name for "a port answered emptily"; this is its second instance.
import { log } from "@/modules/platform";
import type { Price } from "@/modules/purchase-paths";
import { payments } from "./default-payments";

const PRESET = "self-serve-app";

export function selfServeShapes(): ReadonlyArray<Price> {
  const shapes = payments.prices().filter((one) => one.preset === PRESET);
  if (shapes.length === 0)
    log.error("payments: the self-serve shapes are empty; S-P-11 cannot pay", {
      module: "payments",
      action: "selfServeShapes",
      alert: "ALERT_PROVIDER_DOWN",
      surface: "S-P-11",
      reason: "E_PROVIDER",
    });
  return shapes;
}
