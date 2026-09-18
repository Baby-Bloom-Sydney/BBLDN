// The wizard's option lists and limits, from config (L4), with the screens' words for the keys (04 §10 item 24:
// passport (any country) · UK photocard driving licence · eVisa share code; ADR-153's three right-to-work
// kinds). Built once by the route and passed down (01 §2.5: no config read in a component).
import { UPLOADS, VETTING } from "@/modules/config";
import type { WizardOptions } from "../types";

const ID_TYPE_LABELS: Readonly<
  Record<(typeof VETTING.identityEvidence)[number], string>
> = Object.freeze({
  passport: "Passport (any country)",
  uk_driving_licence: "UK photocard driving licence",
  evisa_share_code: "eVisa share code",
});

const RTW_LABELS: Readonly<
  Record<keyof typeof VETTING.rightToWorkEvidence, string>
> = Object.freeze({
  british_irish_passport: "British or Irish passport",
  share_code: "Home Office share code",
  immigration_document: "Immigration document",
});

export function wizardOptions(): WizardOptions {
  return Object.freeze({
    idTypes: VETTING.identityEvidence.map((key) => ({
      key,
      label: ID_TYPE_LABELS[key],
    })),
    rtwKinds: (
      Object.keys(VETTING.rightToWorkEvidence) as ReadonlyArray<
        keyof typeof VETTING.rightToWorkEvidence
      >
    ).map((key) => ({ key, label: RTW_LABELS[key] })),
    dbsNumberLength: VETTING.dbsCertificateNumber.length,
    shareCodeLength: VETTING.shareCode.length,
    // what the wizard's copy promises, so the screen can never state a size the transport refuses (R-5)
    maxBytes: UPLOADS.maxUploadBytes,
    acceptedMimes: UPLOADS.buckets["verification-documents"].mimeTypes,
    pollMs: VETTING.processing.pollMs,
    routeAfterMs: VETTING.processing.routeAfterMs,
    stillCheckingEveryMs: VETTING.processing.stillCheckingEveryMs,
    disclosures: {
      aiProvider: VETTING.biometricNotice.aiProviderDisclosed,
      location: VETTING.biometricNotice.processingLocationDisclosed,
    },
  });
}
