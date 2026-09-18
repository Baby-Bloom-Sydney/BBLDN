// The test double behind the ledger port (05 §3 rule 2): one world holding the `vetting_submissions` rows AND
// the `verifications` sections `0022`'s definers write together, so what `submit_verification_evidence()` does
// in one transaction the double does in one call — the section reads `pending` the moment the row exists, an
// identity submit counts an attempt (a selfie does not), a known evidence id answers the existing row, and the
// provider-side result moves the section the way `apply_vetting_check_result()` does. `verification`'s memory
// store shares this world through `patchSections` / `applyResult`.
import { err, newId, nowInstant, ok } from "@/modules/platform";
import type {
  CheckResult,
  CheckStatus,
  EvidenceType,
  SubmissionId,
  UserId,
} from "@/modules/shared-types";
import type {
  LedgerSection,
  LedgerSectionStatus,
  MemorySectionRow,
  MemoryVerificationRow,
  MemoryVettingStore,
  VettingErrorDetails,
  VettingLedgerEntry,
} from "../types";
import { sectionOfEvidenceType } from "./section-of-evidence-type";

const EMPTY_SECTION: MemorySectionRow = Object.freeze({
  status: "not_started",
  attempts: 0,
});
const EMPTY_ROW: MemoryVerificationRow = Object.freeze({
  level: "L0_SIGNED_UP",
  suspended: false,
  contact: "not_started",
  identity: EMPTY_SECTION,
  dbs: EMPTY_SECTION,
  rightToWork: EMPTY_SECTION,
});

const KEY: Readonly<
  Record<
    Exclude<LedgerSection, "contact" | "cross_check" | "overall">,
    "identity" | "dbs" | "rightToWork"
  >
> = Object.freeze({
  identity: "identity",
  dbs: "dbs",
  right_to_work: "rightToWork",
});

/** 02 §8's object-section names, from the evidence type (the same split `evidenceObjectPath` makes). */
const OBJECT_SECTION: Readonly<Record<EvidenceType, string>> = Object.freeze({
  "identity-document": "identity-document",
  selfie: "identity-selfie",
  "dbs-certificate": "dbs-certificate",
  "dbs-update-service": "dbs-certificate",
  "right-to-work-passport": "rtw-document",
  "right-to-work-share-code": "rtw-document",
  "right-to-work-document": "rtw-document",
});

const sectionStatusOf = (status: CheckStatus): LedgerSectionStatus =>
  status.kind === "needs-admin"
    ? "review"
    : status.kind === "verified"
      ? "verified"
      : status.kind === "rejected"
        ? "rejected"
        : "pending";

const unknown = () =>
  err<VettingErrorDetails>("VALIDATION", "That check is not available", {
    reason: "unsupported-evidence",
  });

export function memoryVettingStore(): MemoryVettingStore {
  const state: {
    rows: ReadonlyArray<VettingLedgerEntry>;
    world: ReadonlyMap<UserId, MemoryVerificationRow>;
  } = { rows: [], world: new Map() };

  const rowOf = (nannyId: UserId): MemoryVerificationRow =>
    state.world.get(nannyId) ?? EMPTY_ROW;
  const patchSections = (
    nannyId: UserId,
    patch: (row: MemoryVerificationRow) => MemoryVerificationRow,
  ): MemoryVerificationRow => {
    const next = patch(rowOf(nannyId));
    state.world = new Map([...state.world, [nannyId, next]]);
    return next;
  };
  const replaceRow = (next: VettingLedgerEntry): void => {
    state.rows = state.rows.map((row) =>
      row.submissionId === next.submissionId ? next : row,
    );
  };

  const applyResult: MemoryVettingStore["applyResult"] = (
    submissionId,
    status,
  ) => {
    const row = state.rows.find((entry) => entry.submissionId === submissionId);
    if (row === undefined) return unknown();
    const key = KEY[row.section as keyof typeof KEY];
    if (key === undefined) return unknown();
    // 0022's STALE_SUBMISSION guard: a result for an older attempt of the same evidence type never lands
    const later = state.rows.some(
      (entry) =>
        entry.nannyId === row.nannyId &&
        entry.section === row.section &&
        entry.evidenceType === row.evidenceType &&
        entry.submittedAt > row.submittedAt,
    );
    if (later)
      return err<VettingErrorDetails>(
        "CONFLICT",
        "That attempt was superseded",
        {
          reason: "unsupported-evidence",
        },
      );
    const sectionStatus = sectionStatusOf(status);
    replaceRow({ ...row, status, checkedAt: nowInstant() });
    patchSections(row.nannyId, (current) => ({
      ...current,
      [key]: {
        ...current[key],
        status: sectionStatus,
        statusAt: nowInstant(),
        submissionId,
        ...(status.kind === "rejected"
          ? { rejectionReason: status.reason, guidanceKey: status.guidanceKey }
          : {}),
        ...(status.kind === "verified" && status.expiresAt !== undefined
          ? { expiresAt: status.expiresAt }
          : {}),
      },
    }));
    return ok({ section: row.section, status: sectionStatus });
  };

  return Object.freeze({
    upsert: async ({ evidence, provider, status, providerRef }) => {
      const existing = state.rows.find((row) => row.evidenceId === evidence.id);
      if (existing !== undefined) return ok(existing);
      const section = sectionOfEvidenceType(evidence.type);
      const key = KEY[section as keyof typeof KEY];
      const current = rowOf(evidence.nannyId);
      if (current.suspended)
        return err("FORBIDDEN", "That account is suspended", {
          reason: "unsupported-evidence",
        });
      const before = current[key].status;
      if (before === "verified" || before === "processing")
        return err("CONFLICT", "That section is not open", {
          reason: "unsupported-evidence",
        });
      const entry: VettingLedgerEntry = Object.freeze({
        submissionId: newId<SubmissionId>(),
        evidenceId: evidence.id,
        provider,
        status,
        ...(providerRef === undefined ? {} : { providerRef }),
        nannyId: evidence.nannyId,
        section,
        evidenceType: evidence.type,
        submittedAt: nowInstant(),
      });
      state.rows = [...state.rows, entry];
      const paths = evidence.documents.map((doc) => ({
        section: OBJECT_SECTION[evidence.type],
        path: doc.path,
      }));
      patchSections(evidence.nannyId, (row) => ({
        ...row,
        [key]: {
          ...row[key],
          status: "pending",
          statusAt: nowInstant(),
          evidenceType: evidence.type,
          attempts:
            row[key].attempts +
            (evidence.type === ("identity-document" as EvidenceType) ? 1 : 0),
        },
        // what 0022's definer keeps from the evidence beside the section (the admin's read, 2c)
        declared: { ...(row.declared ?? {}), ...evidence.declared },
        documents: [...(row.documents ?? []), ...paths],
        ...(evidence.type === "dbs-certificate" &&
        evidence.declared.updateServiceConsent === "true"
          ? {
              updateService: {
                ...(row.updateService ?? {}),
                consentAt: evidence.submittedAt,
              },
            }
          : {}),
      }));
      return ok(entry);
    },
    findByEvidence: async (evidenceId) =>
      ok(state.rows.find((row) => row.evidenceId === evidenceId) ?? null),
    read: async (submissionId) =>
      ok(state.rows.find((row) => row.submissionId === submissionId) ?? null),
    list: async (filter) =>
      ok(
        state.rows.filter(
          (row) =>
            (filter.nannyId === undefined || row.nannyId === filter.nannyId) &&
            (filter.section === undefined || row.section === filter.section) &&
            (filter.status === undefined || row.status.kind === filter.status),
        ),
      ),
    // `record_vetting_decision()` in the memory world (ADR-157 (2)): the result, the note, and for dbs the outcome
    // and the cross-check the admin IS under stub-manual. The level itself is `verification`'s to derive
    // (`syncLevel`), because the rule lives there and this module may not import it (01 §2.3).
    recordDecision: async (input) => {
      if (input.decision === "rejected" && input.reason === undefined)
        return err<VettingErrorDetails>(
          "VALIDATION",
          "A rejection needs a reason",
          { reason: "mismatch" },
        );
      const status: CheckStatus =
        input.decision === "verified"
          ? {
              kind: "verified",
              at: nowInstant(),
              ...(input.expiresAt === undefined
                ? {}
                : { expiresAt: input.expiresAt }),
            }
          : {
              kind: "rejected",
              reason: input.reason ?? "mismatch",
              guidanceKey: `${input.reason ?? "mismatch"}` as never,
            };
      const before = state.rows.find(
        (entry) => entry.submissionId === input.submissionId,
      );
      const applied = applyResult(input.submissionId, status);
      if (!applied.ok) return applied;
      if (input.note !== undefined && before !== undefined)
        replaceRow({
          ...state.rows.find((e) => e.submissionId === input.submissionId)!,
          note: input.note,
        });
      if (before !== undefined && before.section === "dbs")
        patchSections(before.nannyId, (row) =>
          input.decision === "verified"
            ? { ...row, dbsOutcome: "cleared", crossCheckPassed: true }
            : input.reason === "adverse"
              ? { ...row, dbsOutcome: "barred", crossCheckPassed: false }
              : { ...row, dbsOutcome: "unset", crossCheckPassed: false },
        );
      const result: CheckResult = {
        submissionId: input.submissionId,
        status,
        checkedAt: nowInstant(),
      };
      return ok(result);
    },
    rows: () => state.rows,
    sectionsOf: (nannyId) => state.world.get(nannyId),
    nannyIds: () => [...state.world.keys()],
    patchSections,
    applyResult,
  });
}
