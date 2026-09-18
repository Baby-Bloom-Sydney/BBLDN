// The consent store stub (05 §3 rule 1: production code inside the module, one export): the three append-only
// tables of 02 §4.1 in memory, plus the `legal_documents` current-version lookup (every id at version 1 unless
// told otherwise). The real store (S5 tables over `auth`'s port) replaces it at boot; nothing else changes.
import type {
  ConsentRecordId,
  Instant,
  Result,
  UserId,
} from "@/modules/shared-types";
import type {
  BiometricConsentRecord,
  ConsentRecord,
  ConsentSubject,
  CookieConsentRecord,
  CurrentDocument,
  LegalDocumentId,
  MemoryConsentStore,
} from "./types";
import { CONSENT_PURPOSES } from "./lib/consent-purposes";
import { err } from "../lib/err";
import { ok } from "../lib/ok";

type Documents = Partial<
  Readonly<
    Record<
      LegalDocumentId,
      CurrentDocument extends infer D ? Omit<D, "id"> : never
    >
  >
>;

// Ruling 5.1 — a stub document version carries a hash like a real one, so a test that builds a consent through
// the stub exercises the same triple the database enforces rather than a two-thirds-shaped one.
const DEFAULT_DOCUMENT = Object.freeze({
  version: 1,
  contentHash: "stub-hash-v1",
  requiresReacceptance: false as const,
});
const isDocumentId = (purpose: string): purpose is LegalDocumentId =>
  purpose !== "vaccination-status" &&
  CONSENT_PURPOSES.includes(purpose as LegalDocumentId);

const matchesSubject = (
  row: CookieConsentRecord,
  subject: ConsentSubject,
): boolean =>
  subject.kind === "visitor"
    ? row.visitorId === subject.id
    : row.userId === subject.id;

export function memoryConsentStore(
  options: { readonly documents?: Documents } = {},
): MemoryConsentStore {
  const state = {
    consents: [] as ReadonlyArray<ConsentRecord>,
    biometrics: [] as ReadonlyArray<BiometricConsentRecord>,
    cookies: [] as ReadonlyArray<CookieConsentRecord>,
  };

  const insertCookie = async (
    row: CookieConsentRecord,
  ): Promise<Result<{ readonly supersededId?: ConsentRecordId }>> => {
    const previous = [...state.cookies]
      .reverse()
      .find(
        (r) => r.visitorId === row.visitorId && r.supersededBy === undefined,
      );
    state.cookies = [
      ...state.cookies.map((r) =>
        r === previous ? { ...r, supersededBy: row.id } : r,
      ),
      row,
    ];
    return ok(previous === undefined ? {} : { supersededId: previous.id });
  };

  return Object.freeze({
    insertConsent: async (row) => {
      state.consents = [...state.consents, row];
      return ok(undefined);
    },
    latestConsent: async (userId, purpose) =>
      ok(
        [...state.consents]
          .reverse()
          .find((r) => r.userId === userId && r.purpose === purpose) ?? null,
      ),
    insertBiometric: async (row) => {
      if (
        state.biometrics.some(
          (r) =>
            r.userId === row.userId && r.noticeVersion === row.noticeVersion,
        )
      ) {
        return err(
          "CONFLICT",
          "A biometric consent exists for this notice version",
          { reason: "duplicate-version" },
        );
      }
      state.biometrics = [...state.biometrics, row];
      return ok(undefined);
    },
    insertCookie,
    currentCookie: async (subject) =>
      ok(
        [...state.cookies]
          .reverse()
          .find(
            (r) => r.supersededBy === undefined && matchesSubject(r, subject),
          ) ?? null,
      ),
    currentDocument: async (id) =>
      isDocumentId(id)
        ? ok({
            id,
            ...(options.documents?.[id] ?? DEFAULT_DOCUMENT),
          } as CurrentDocument)
        : ok(null),
    // FATE `10.18` — the same answer `0029`'s `consent_subjects_due_for_renewal` gives: the newest row per
    // subject for one purpose, kept only when it predates the cutoff. Written as a reduce rather than a filter
    // because "newest per subject" is the whole point: a person with an old row AND a recent one is not due,
    // and a `filter(created_at < before)` would have said she was.
    subjectsDueForRenewal: async ({ purpose, before, limit }) => {
      const newest = new Map<UserId, Instant>();
      for (const row of state.consents) {
        if (row.purpose !== purpose) continue;
        const seen = newest.get(row.userId);
        if (seen === undefined || row.createdAt > seen)
          newest.set(row.userId, row.createdAt);
      }
      return ok(
        [...newest.entries()]
          .filter(([, createdAt]) => createdAt < before)
          .map(([userId]) => userId)
          .sort()
          .slice(0, limit),
      );
    },
    get consents() {
      return state.consents;
    },
    get biometrics() {
      return state.biometrics;
    },
    get cookies() {
      return state.cookies;
    },
  });
}
