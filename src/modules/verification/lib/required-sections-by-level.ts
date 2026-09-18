// `VETTING.requiredChecksByLevel` names evidence TYPES per level (03 §4.2); the derivation — in SQL and here —
// judges SECTIONS, because a section is what carries a status. One evidence type → one ledger section
// (`sectionOfEvidenceType`, the rule `0022` enforces), de-duplicated and ordered so the same config always
// produces the same `p_required` the sync validates. Pure.
import type { EvidenceType } from "@/modules/shared-types";
import type { LedgerSection } from "@/modules/vetting-providers";
import type { VerificationLevel } from "../types";

/**
 * The same map as `vetting-providers`' `sectionOfEvidenceType` (03 §4.3), restated here because this file must
 * import nothing that reaches `config`'s env reader — `int.rpc-0023` imports it into a project that boots no
 * environment. `verification.pure.test.ts` pins the two maps equal.
 */
const SECTION_OF: Readonly<Record<EvidenceType, LedgerSection>> = Object.freeze({
  "identity-document": "identity",
  selfie: "identity",
  "dbs-certificate": "dbs",
  "dbs-update-service": "dbs",
  "right-to-work-passport": "right_to_work",
  "right-to-work-share-code": "right_to_work",
  "right-to-work-document": "right_to_work",
});

export type RequiredSectionsByLevel = Readonly<
  Record<VerificationLevel, ReadonlyArray<LedgerSection>>
>;

export function requiredSectionsByLevel(
  requiredChecks: Readonly<
    Record<VerificationLevel, ReadonlyArray<EvidenceType>>
  >,
): RequiredSectionsByLevel {
  const entries = (
    Object.keys(requiredChecks) as ReadonlyArray<VerificationLevel>
  ).map((level) => {
    const sections = [
      ...new Set(requiredChecks[level].map((type) => SECTION_OF[type])),
    ].sort();
    return [level, Object.freeze(sections)] as const;
  });
  return Object.freeze(
    Object.fromEntries(entries) as Record<
      VerificationLevel,
      ReadonlyArray<LedgerSection>
    >,
  );
}
