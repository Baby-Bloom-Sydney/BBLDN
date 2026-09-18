// The inverse join of `ledgerSectionOf`; `contact` / `cross_check` / `overall` carry no evidence and answer `null`.
import type { LedgerSection } from "@/modules/vetting-providers";
import type { VerificationSection } from "../types";

const FROM_LEDGER: Readonly<
  Partial<Record<LedgerSection, VerificationSection>>
> = Object.freeze({
  identity: "identity",
  dbs: "dbs",
  right_to_work: "right-to-work",
});

export function sectionOfLedger(
  section: LedgerSection,
): VerificationSection | null {
  return FROM_LEDGER[section] ?? null;
}
