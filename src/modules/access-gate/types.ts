// access-gate — the one read every app surface asks before rendering the product: "is the app open for this
// family?" (01 §2.3; 03 §10.1). It derives the answer from `payments.getAccess` and re-exports `setAccess` for
// S-A-10; it sends nothing and emits nothing — `payments` owns the events and `app-ready` (fix: A-3).
import type { AccessState, PaymentsErrorReason } from "@/modules/payments";
import type { Instant, Result } from "@/modules/shared-types";

/**
 * Why the gate answered as it did — the standing's own name, so an admin screen can say it without a second
 * vocabulary. `toggled-on` / `toggled-off` split the admin override because the two read very differently on
 * S-A-10 (ADR-093).
 */
export type AccessReason =
  | "none"
  | "deposit-paid"
  | "placed"
  | "trial"
  | "active"
  | "paid-in-full"
  | "toggled-on"
  | "toggled-off"
  | "lapsed"
  | "access-ended";

export type AccessDecision = {
  readonly open: boolean;
  /** When the current grant runs out; `null` when nothing bounds it yet (no child linked — ADR-083 / 084). */
  readonly until: Instant | null;
  readonly reason: AccessReason;
  /** The standing the decision was taken from, so a caller need not ask `payments` twice. */
  readonly state: AccessState;
};

/**
 * `hasAccess` forwards `payments.getAccess`'s error unchanged, so its reasons are `payments`' reasons. Typed as
 * the closed union rather than `string` so a caller matching on `details.reason` keeps narrowing and typo
 * protection at this layer too — every sibling error-details type in the tree is closed the same way.
 */
export type AccessGateErrorDetails = { readonly reason: PaymentsErrorReason };

export type AccessGateResult<T> = Result<T, AccessGateErrorDetails>;
