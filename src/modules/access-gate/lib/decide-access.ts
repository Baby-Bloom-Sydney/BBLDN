// The pure gate rule (03 §5.2 / §5.4.5 / §5.4.6). Every branch is stated by the contract; nothing is inferred:
//
//   toggled       → overrides every other standing, both ways (on ⇒ open even unpaid or lapsed, until
//                   `until ?? accessUntil`; off ⇒ closed even paid) — ADR-093
//   deposit-paid  → **closed**; the deposit secures the place and opens nothing (ADR-097)
//   placed        → open; the app is on from the nanny's first day, before any bill (ADR-093 / 094)
//   trial         → open (self-serve only — ADR-068 / 093)
//   active · paid-in-full → open; past-due is lapsed by its cron, not by this read (§5.4.5)
//   lapsed · none → closed
//
// `accessUntil` — the youngest linked child's third birthday (ADR-083 / 084) — closes the gate once it has
// passed, whatever the standing says. The crons lapse the record; this read does not wait for them, because an
// expired grant that still renders the product is the failure that matters.
import type { AccessState } from "@/modules/payments";
import type { Instant } from "@/modules/shared-types";
import type { AccessDecision, AccessReason } from "../types";

type Grant = { readonly open: boolean; readonly reason: AccessReason };

const decide = (state: AccessState): Grant => {
  switch (state.state) {
    case "toggled":
      return state.on
        ? { open: true, reason: "toggled-on" }
        : { open: false, reason: "toggled-off" };
    case "placed":
      return { open: true, reason: "placed" };
    case "trial":
      return { open: true, reason: "trial" };
    case "active":
      return { open: true, reason: "active" };
    case "paid-in-full":
      return { open: true, reason: "paid-in-full" };
    case "deposit-paid":
      return { open: false, reason: "deposit-paid" };
    case "lapsed":
      return { open: false, reason: "lapsed" };
    case "none":
      return { open: false, reason: "none" };
    default:
      // Exhaustive by construction: a new `AccessState` variant fails the compile here rather than falling
      // through to a default. The runtime arm still closes the gate, because an unrecognised standing is not
      // evidence of a paid family — but no one should ever reach it.
      return assertNever(state);
  }
};

/** A new standing must be decided deliberately; until it is, the gate is closed. */
const assertNever = (state: never): Grant => {
  void state;
  return { open: false, reason: "none" };
};

const boundOf = (state: AccessState): Instant | null => {
  if (state.state === "toggled") return state.until ?? state.accessUntil;
  return "accessUntil" in state ? state.accessUntil : null;
};

export function decideAccess(state: AccessState, now: Instant): AccessDecision {
  const grant = decide(state);
  const until = boundOf(state);
  const expired = until !== null && until <= now;
  return Object.freeze({
    open: grant.open && !expired,
    until,
    reason: grant.open && expired ? "access-ended" : grant.reason,
    state,
  });
}
