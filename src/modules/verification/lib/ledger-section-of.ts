// The wizard's section names (03 §4.3, kebab) ↔ the ledger's `verification_section` (02 §3, snake).
import type { LedgerSection } from "@/modules/vetting-providers";
import type { VerificationSection } from "../types";

const TO_LEDGER: Readonly<Record<VerificationSection, LedgerSection>> =
  Object.freeze({
    identity: "identity",
    dbs: "dbs",
    "right-to-work": "right_to_work",
  });

export function ledgerSectionOf(section: VerificationSection): LedgerSection {
  return TO_LEDGER[section];
}
