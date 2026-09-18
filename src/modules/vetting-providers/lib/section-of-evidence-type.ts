// 03 §4.2's seven evidence types → 02 §3's `verification_section` the ledger files them under (03 §4.3: identity =
// document + selfie; dbs = certificate + Update Service; right-to-work = one of three). Pure; the same rule
// `0022`'s definer enforces (database-reviewer M3).
import type { EvidenceType } from "@/modules/shared-types";
import type { LedgerSection } from "../types";

const SECTION_OF: Readonly<Record<EvidenceType, LedgerSection>> = Object.freeze(
  {
    "identity-document": "identity",
    selfie: "identity",
    "dbs-certificate": "dbs",
    "dbs-update-service": "dbs",
    "right-to-work-passport": "right_to_work",
    "right-to-work-share-code": "right_to_work",
    "right-to-work-document": "right_to_work",
  },
);

export function sectionOfEvidenceType(type: EvidenceType): LedgerSection {
  return SECTION_OF[type];
}
