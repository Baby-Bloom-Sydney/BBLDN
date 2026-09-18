"use server";

// The legacy clickwrap surfaces' consent writer, **re-based onto the connector** (L-009 `3g`; FATE `10.11` /
// `10.16`; ADR-173).
//
// **What was here, and why it could not work.** It built the `consent_records` row itself with the admin client:
// `user_type` (a column the London table does not have — it is `party`), `document_id` and `document_version`
// from a hand-rolled "latest version" query, and no content hash at all. Both halves are now refused by the
// database. Measured against the applied stack on 2026-09-20 rather than reasoned about:
//
//     insert … (document_id, document_version) values ('client-tos', 1)
//     → 23502  "consent_records.document_content_hash must name the content_hash of the version accepted"
//
// So every surface still calling this — the funnel's account step, the two connection informed-actions, the
// per-child consents, the renewal and decline rows — was writing nothing. It stayed invisible because no test
// exercised the legacy road against a stack with `0026` applied, and because each caller treats a consent
// failure as non-fatal and logs it.
//
// **The re-base is the fix, and it costs the callers nothing.** The signature is unchanged, so no legacy screen
// is touched; the inside now goes through `platform/consent`, which resolves the current document, binds the
// whole triple (ruling 5.1) and lets `0026`'s composite key refuse anything else. The day `3a`'s ratified text
// lands as version 2, these surfaces record the new words without being edited, because they ask rather than
// assume — which is what "pointed at the draft documents" was always meant to mean.
//
// **`recordBiometricConsent` is gone from this file, and that closes stocktake 05 Q6.** The fate table records
// Sydney as having two biometric mechanisms, of which "the inline checkbox writes no record"; this was the
// second one. It had no caller — the live road is `verification`'s `recordBiometricNoticeConsent`, which binds
// the notice's hash as Art 9(2)(a) requires — and it would have been refused by `notice_content_hash NOT NULL`
// in any case. One recorder, and no second road to drift from it.
import { headers } from "next/headers";
import { auth } from "@/modules/auth";
import type { ConsentContext } from "@/modules/platform";
import type { UserId, Uuid } from "@/modules/shared-types";
import { purposeForAgreement } from "./purpose-for-agreement";
import { recordDocumentConsent } from "./record-document-consent";
import type { AgreementId } from "./types";

interface ConsentInput {
  agreementId: AgreementId;
  checkpointId: string;
  checkpointText: string;
  /** A decline / withdrawal is a new row with `false` — never a deletion (02 §4.1; Art 7(3)). */
  consentGiven?: boolean;
}

export async function recordConsent(
  checkpoints: ConsentInput[],
  relatedEntityId?: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await auth.getSession();
  if (!session.ok || session.value === null)
    return { success: false, error: "Not authenticated" };
  const { userId, role } = session.value;
  if (role === "admin")
    // 02 §4.1: an admin never consents on a party's behalf. Silently writing `party: 'parent'` for an admin
    // session would put a consent in the trail that no customer ever gave.
    return { success: false, error: "An admin cannot consent for a party" };

  const context = await requestContext();

  for (const checkpoint of checkpoints) {
    const target = purposeForAgreement(checkpoint.agreementId);
    if (target === null) return { success: false, error: "Unknown agreement" };
    const recorded = await recordDocumentConsent({
      userId: userId as UserId,
      party: role,
      agreementId: target.agreementId,
      purpose: target.purpose,
      checkpointId: checkpoint.checkpointId,
      checkpointText: checkpoint.checkpointText,
      consentGiven: checkpoint.consentGiven ?? true,
      context,
      ...(relatedEntityId === undefined
        ? {}
        : { relatedEntityId: relatedEntityId as Uuid }),
    });
    // One failure fails the call rather than the loop carrying on: a partially-recorded clickwrap is a trail
    // that says she agreed to some of what she was shown, which is worse than one saying she agreed to none.
    if (!recorded.ok)
      return { success: false, error: "Failed to record consent" };
  }

  return { success: true };
}

export async function recordInformedAction(data: {
  agreementId: AgreementId;
  buttonText: string;
  relatedEntityId?: string;
}): Promise<{ success: boolean; error?: string }> {
  return recordConsent(
    [
      {
        agreementId: data.agreementId,
        checkpointId: "informed_action_click",
        checkpointText: data.buttonText,
      },
    ],
    data.relatedEntityId,
  );
}

/** 02 §4.1 stores these on the row and 01 §4b forbids logging them; the connector carries them through. */
async function requestContext(): Promise<ConsentContext> {
  const list = headers();
  const ipAddress = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = list.get("user-agent") ?? undefined;
  return Object.freeze({
    ...(ipAddress === undefined || ipAddress === "" ? {} : { ipAddress }),
    ...(userAgent === undefined ? {} : { userAgent }),
  });
}
