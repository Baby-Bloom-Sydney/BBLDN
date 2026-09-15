// 03 §9.3 Purchase (10): `payments` (`payment.due` from job `payment-due-sweep`). Money = integer minor units
// with the currency beside it (01 §4c rule 3) — the currency literal comes from config (L4).
import { z } from "zod";
import { LOCALE } from "@/modules/config";
import { ENUMS } from "@/modules/shared-types";
import { PROPS_PARTS as P } from "../lib/props-parts";

const purchase = {
  familyId: P.id,
  path: z.enum(["payment-link", "self-serve"]),
  linkKind: z.enum(ENUMS.payment_link_kind).optional(),
  preset: P.label.optional(),
  depositMinor: P.pence.optional(),
  firstWeekWagesMinor: P.pence.optional(),
  shape: z.enum(["upfront", "instalments"]).optional(),
  amountMinor: P.pence.optional(),
  currency: z.literal(LOCALE.currency).optional(),
  placementId: P.id.optional(),
  paymentDueAt: P.instant.optional(),
  satisfactionWindowEndsAt: P.instant.optional(),
  trialEndsAt: P.instant.optional(),
  reason: P.label.optional(),
  on: z.boolean().optional(),
  until: P.instant.optional(),
  providerEventId: P.label.optional(),
};

export const PURCHASE_EVENT_SCHEMAS = Object.freeze({
  "bundle.link-sent": P.props(purchase),
  "deposit.paid": P.props(purchase),
  "deposit.refunded": P.props(purchase),
  "payment.due": P.props(purchase),
  "trial.started": P.props(purchase),
  "bundle.paid": P.props(purchase),
  "bundle.payment-failed": P.props(purchase),
  "access.opened": P.props({ ...purchase, reason: P.label }),
  "access.toggled": P.props({ ...purchase, reason: P.label, on: z.boolean() }),
  "access.lapsed": P.props({ ...purchase, reason: P.label }),
});
