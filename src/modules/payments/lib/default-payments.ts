// The connector object `access-gate`, `placements`, `admin` and the route shells import (01 §2.3). Re-reads the
// registry on every call so boot wiring reaches every importer and a test can swap the inside between cases.
import type { PurchasePath } from "../types";
import { PAYMENTS_REGISTRY } from "./payments-registry";

// Declared, then frozen: the annotation on a `const` is what contextually types the arrow bodies
// below, and `Object.freeze` alone would infer them away.
const binding: PurchasePath = {
  createPaymentLink: (familyId, kind, plan, actor, custom) =>
    PAYMENTS_REGISTRY.get().createPaymentLink(
      familyId,
      kind,
      plan,
      actor,
      custom,
    ),
  createCheckout: (familyId, preset, plan, actor) =>
    PAYMENTS_REGISTRY.get().createCheckout(familyId, preset, plan, actor),
  handleWebhook: (event) => PAYMENTS_REGISTRY.get().handleWebhook(event),
  getAccess: (familyId) => PAYMENTS_REGISTRY.get().getAccess(familyId),
  startTrial: (familyId, actor) =>
    PAYMENTS_REGISTRY.get().startTrial(familyId, actor),
  openDfyAccess: (familyId, placementId, actor) =>
    PAYMENTS_REGISTRY.get().openDfyAccess(familyId, placementId, actor),
  setAccess: (familyId, on, reason, actor, until) =>
    PAYMENTS_REGISTRY.get().setAccess(familyId, on, reason, actor, until),
  portal: (familyId, actor) => PAYMENTS_REGISTRY.get().portal(familyId, actor),
  prices: () => PAYMENTS_REGISTRY.get().prices(),
};

export const payments: PurchasePath = Object.freeze(binding);
