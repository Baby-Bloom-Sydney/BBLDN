// 03 §8.2 — every `TemplateId` the day-one registry names, as a value so a table test can walk them (03 §11
// row 7; 05 §3). One entry per key of `TemplateRegistry`.
//
// ★ **4a — `satisfies` alone did not keep the two in step.** `as const satisfies ReadonlyArray<TemplateId>`
// proves every entry *is* an id; it proves nothing about an id that is **missing**. ADR-168 (b) added
// `verification-suspension-lifted` and `admin-nanny-suspension-lifted` to `TemplateRegistry`, both were left out
// of this list, and `validate-message.ts` builds `KNOWN_TEMPLATES` from **this list** — so the seam answered
// `unknown-template` to the two sends the lift-suspension road was built to make, and every green test agreed
// with it. A declared thing nothing could reach (ecc-lite rule 3), found by comparing the two directions.
//
// The fix is a gate, not a note (ecc-lite rule 1): `EveryTemplateIdIsListed` in `../types.ts` fails
// **`typecheck`** the moment an id is added to `TemplateRegistry` and not to this array.
import type { TemplateId } from "../types";

export const TEMPLATE_IDS = Object.freeze([
  "welcome-parent",
  "welcome-parent-position",
  "welcome-parent-invited",
  "welcome-nanny",
  "call-confirmation",
  "call-rescheduled",
  "call-cancelled",
  "call-reminder",
  "admin-call-due",
  "admin-commission-booking",
  "precheck-nanny",
  "precheck-nanny-reminder",
  "precheck-parent-response",
  "precheck-complete",
  "connection-requested",
  "connection-accepted",
  "connection-declined",
  "connection-expired-parent",
  "connection-expired-nanny",
  "meeting-scheduled",
  "connection-followup-parent",
  "meeting-followup-nanny",
  "trial-followup-nanny",
  "confirm-nanny",
  "position-offered",
  "no-candidates-left",
  "placement-confirmed-parent",
  "placement-confirmed-nanny",
  "hire-confirmation-family",
  "hire-confirmation-nanny",
  "verification-pending",
  "verification-approved",
  "verification-action-needed",
  "verification-barred",
  "admin-nanny-barred",
  // ADR-168 (b) — a bar was lifted. Declared in `TemplateRegistry` since P2-FIX; missing here until 4a.
  "verification-suspension-lifted",
  "admin-nanny-suspension-lifted",
  "verification-reminder",
  "bundle-payment-link",
  "app-ready",
  "trial-reminder",
  "feed-post",
  "contact-request",
  "contact-request-public",
  "support-reply",
  "admin-contact",
  "availability-updated",
  "admin-test",
] as const satisfies ReadonlyArray<TemplateId>);
