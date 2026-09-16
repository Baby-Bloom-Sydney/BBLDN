// The `legal_documents` rows (02 §4.1 row 4; `0003`) → the current version of one document (`CurrentDocument`),
// or `null` when no row carries that id. Pure. "Current" is the highest version; a `requires_reacceptance` row
// carries its deadline (the table's CHECK guarantees the pair). The deadline column is a `date`, so it is widened
// to the instant at UTC midnight of that day — the type the connector spells.
import type { AppDatabase } from "@/modules/auth";
import type { CurrentDocument, LegalDocumentId } from "@/modules/platform";
import type { Instant } from "@/modules/shared-types";

type LegalDocumentRow = AppDatabase["Tables"]["legal_documents"]["Row"];

const toInstant = (date: string): Instant =>
  new Date(date).toISOString() as Instant;

export function currentDocumentFromRows(
  rows: ReadonlyArray<LegalDocumentRow>,
  id: LegalDocumentId,
): CurrentDocument | null {
  const newest = rows
    .filter((row) => row.document_id === id)
    .reduce<LegalDocumentRow | null>(
      (best, row) => (best === null || row.version > best.version ? row : best),
      null,
    );
  if (newest === null) return null;
  if (newest.requires_reacceptance && newest.reacceptance_deadline !== null)
    return Object.freeze({
      id,
      version: newest.version,
      requiresReacceptance: true,
      reacceptanceDeadline: toInstant(newest.reacceptance_deadline),
    });
  return Object.freeze({
    id,
    version: newest.version,
    requiresReacceptance: false,
  });
}
