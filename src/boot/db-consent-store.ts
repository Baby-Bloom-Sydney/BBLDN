// The `ConsentStore` of `platform/consent` (02 R-4; 07 §2.6 / §2.7(a)) over `auth`'s data port. Session scope
// throughout: `consent_records` and `biometric_consent_records` carry self-insert and self-select policies (0004),
// so RLS bounds every read to the caller's own rows (an admin's read is widened by `*_admin_select`), and
// `legal_documents` is public-read. The narrow `Query` surface has no predicate, so "latest for (user, purpose)"
// and "current version of a document" are computed over the RLS-bounded rows in memory — acceptable for a
// person's own consent trail and an eleven-slug document table, and said here so nobody mistakes it for an index.
//
// The cookie half fails closed. `cookie_consent_records` has **no client policy** — 07 §5.1 rule 5 makes
// `recordCookieConsent` a service-role use — and finding a visitor's current row under the service role is a
// keyed read the `Query` surface cannot express except as a scan of every visitor's record. That is not a store,
// so `insertCookie` / `currentCookie` answer `cookie-consent-not-available`: `hasMarketing` therefore refuses,
// which is the safe side of 07 §2.9 (no pixel, no CAPI). Recorded in the L-007 P1-WIRE entry with its owner.
import type { DataAccessPort } from "@/modules/auth";
import { err } from "@/modules/platform";
import type {
  ConsentPurpose,
  ConsentRecord,
  ConsentStore,
} from "@/modules/platform";
import type { UserId } from "@/modules/shared-types";
import { biometricInsertRow } from "./biometric-insert-row";
import { consentInsertRow } from "./consent-insert-row";
import { consentRecordFromRow } from "./consent-record-from-row";
import { currentDocumentFromRows } from "./current-document-from-rows";

const COOKIE_NOT_AVAILABLE = err(
  "INTERNAL",
  "Cookie consent storage is not available",
  { reason: "cookie-consent-not-available" },
);

const newestFirst = (a: ConsentRecord, b: ConsentRecord): number =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;

function latestOf(
  records: ReadonlyArray<ConsentRecord | null>,
  userId: UserId,
  purpose: ConsentPurpose,
): ConsentRecord | null {
  return (
    records
      .filter((r): r is ConsentRecord => r !== null)
      .filter((r) => r.userId === userId && r.purpose === purpose)
      .sort(newestFirst)[0] ?? null
  );
}

export function dbConsentStore(port: DataAccessPort): ConsentStore {
  return Object.freeze({
    insertConsent: (row, opts) =>
      port.run(
        {
          name: "platform.consent.insertConsent",
          exec: async (q) => {
            await q.from("consent_records").insert(consentInsertRow(row));
          },
        },
        { uow: opts?.uow },
      ),
    latestConsent: (userId, purpose) =>
      port.run({
        name: "platform.consent.latestConsent",
        exec: async (q) =>
          latestOf(
            (await q.from("consent_records").select()).map(
              consentRecordFromRow,
            ),
            userId,
            purpose,
          ),
      }),
    insertBiometric: (row, opts) =>
      port.run(
        {
          name: "platform.consent.insertBiometric",
          exec: async (q) => {
            await q
              .from("biometric_consent_records")
              .insert(biometricInsertRow(row));
          },
        },
        { uow: opts?.uow },
      ),
    insertCookie: async () => COOKIE_NOT_AVAILABLE,
    currentCookie: async () => COOKIE_NOT_AVAILABLE,
    currentDocument: (id) =>
      port.run({
        name: "platform.consent.currentDocument",
        exec: async (q) =>
          currentDocumentFromRows(await q.from("legal_documents").select(), id),
      }),
  });
}
