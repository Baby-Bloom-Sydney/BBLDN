// The `ConsentStore` of `platform/consent` (02 R-4; 07 §2.6 / §2.7(a) / §2.9) over `auth`'s data port. Session scope
// for the person's own tables: `consent_records` and `biometric_consent_records` carry self-insert and self-select
// policies (0004), so RLS bounds every read to the caller's own rows (an admin's read is widened by
// `*_admin_select`), and `legal_documents` is public-read. "Latest for (user, purpose)" is a keyed read on
// `user_id` (ADR-131 (1)) filtered by purpose in memory — a person's own consent trail; "current version of a
// document" is computed over the eleven-slug document table.
//
// The cookie half runs under the **service role** — `cookie_consent_records` has no client policy and 07 §5.1
// rule 5 names `recordCookieConsent` as a service-role use. `currentCookie` is a keyed read on `visitor_id` /
// `user_id`, the current choice being the newest un-superseded row (0004 makes that unique). `insertCookie` is the
// `record_cookie_consent` RPC of `0017`: the new row and the `superseded_by` stamp on the old one cannot be two
// PostgREST statements (the partial unique + the FK forbid either order), so it is one definer function — ADR-127.
import type { DataAccessPort } from "@/modules/auth";
import { err } from "@/modules/platform";
import type {
  ConsentPurpose,
  ConsentRecord,
  ConsentStore,
  CookieConsentRecord,
} from "@/modules/platform";
import type { UserId } from "@/modules/shared-types";
import { biometricInsertRow } from "./biometric-insert-row";
import { consentInsertRow } from "./consent-insert-row";
import { consentRecordFromRow } from "./consent-record-from-row";
import { cookieRecordFromRow } from "./cookie-record-from-row";
import { currentDocumentFromRows } from "./current-document-from-rows";

const COOKIE_WRITE_NOT_AVAILABLE = err(
  "INTERNAL",
  "Cookie consent storage is not available",
  { reason: "cookie-consent-write-not-available" },
);

const newestCurrent = (
  rows: ReadonlyArray<CookieConsentRecord>,
): CookieConsentRecord | null =>
  rows
    .filter((r) => r.supersededBy === undefined)
    .sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    )[0] ?? null;

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
            (
              await q.from("consent_records").eq("user_id", userId).select()
            ).map(consentRecordFromRow),
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
    insertCookie: async () => COOKIE_WRITE_NOT_AVAILABLE,
    currentCookie: (subject) =>
      port.run(
        {
          name: "platform.consent.currentCookie",
          exec: async (q) =>
            newestCurrent(
              (
                await q
                  .from("cookie_consent_records")
                  .eq(
                    subject.kind === "visitor" ? "visitor_id" : "user_id",
                    subject.id,
                  )
                  .select()
              ).map(cookieRecordFromRow),
            ),
        },
        { scope: "service" },
      ),
    currentDocument: (id) =>
      port.run({
        name: "platform.consent.currentDocument",
        exec: async (q) =>
          currentDocumentFromRows(await q.from("legal_documents").select(), id),
      }),
  });
}
