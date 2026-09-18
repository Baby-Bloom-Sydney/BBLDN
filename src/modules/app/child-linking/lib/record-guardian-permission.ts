// AGR-14 — the guardian-permission disclaimer a nanny ticks before she adds a family she works for
// (04 §4.4 c1 "Add a child → guardian-permission disclaimer (AGR-14) → invite token").
//
// It is an **informed action**, not a document consent (07 §2.8; 02 §4.1 "document nullable"): there is no
// document for her to accept — she is stating a fact about somebody else's authority, and the record exists so
// that the fact has a date, an author and a child attached to it. `relatedEntityId` is that child, which is why
// this runs after the row exists rather than before.
import { BRAND } from "@/modules/config";
import { consent } from "@/modules/platform";
import type { ChildId, Result, UserId, Uuid } from "@/modules/shared-types";

const AGREEMENT_ID = "AGR-14" as const;
const CHECKPOINT_ID = "agr14_guardian_permission";
// The tick's own wording, so the evidence reads as she saw it. The brand is `config`'s, never a literal (L4).
const CHECKPOINT_TEXT = `I have this family's permission to add their child and to invite them to ${BRAND.name}.`;

export async function recordGuardianPermission(
  userId: UserId,
  childId: ChildId,
): Promise<Result<void>> {
  const recorded = await consent.recordInformedAction({
    userId,
    party: "nanny",
    agreementId: AGREEMENT_ID,
    checkpointId: CHECKPOINT_ID,
    checkpointText: CHECKPOINT_TEXT,
    purpose: "agr14_nanny_child_add",
    context: {},
    relatedEntityId: childId as string as Uuid,
  });
  return recorded.ok ? { ok: true, value: undefined } : recorded;
}
