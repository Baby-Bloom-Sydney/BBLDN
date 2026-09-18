// The test double behind the store port (05 §3 rule 2), over `vetting-providers`' memory world so what `0022`'s
// and `0023`'s definers do in one transaction the two doubles do in one call: the section reads `pending` the
// moment the ledger row exists, the contact stamp and the processing claim act for the SESSION's nanny (as
// `auth.uid()` does), the provider-side result moves the section the way `apply_vetting_check_result()` does, and
// — since `2c` — the level is derived here with `deriveLevel` the way `sync_nanny_verification_state()` derives it
// (ADR-157), the held count is released at L4 (ADR-158), and the decision-side reads answer the world's facts.
import { auth } from "@/modules/auth";
import { VETTING } from "@/modules/config";
import { err, nowInstant, ok } from "@/modules/platform";
import { ENUMS } from "@/modules/shared-types";
import type { NannyId, Result, UserId } from "@/modules/shared-types";
import type {
  MemorySectionRow,
  MemoryVerificationRow,
  MemoryVettingStore,
} from "@/modules/vetting-providers";
import type {
  AdminRecord,
  LevelSync,
  SectionState,
  VerificationDecisionStore,
  VerificationErrorDetails,
  VerificationLevel,
  VerificationSection,
  VerificationState,
  VerificationStore,
} from "../types";
import { deriveLevel } from "./derive-level";
import { sectionOfLedger } from "./section-of-ledger";

const NO_SESSION = err<VerificationErrorDetails>(
  "UNAUTHENTICATED",
  "Sign in to continue.",
  {
    reason: "not-permitted",
  },
);
const MINUTE_MS = 60_000;
const rank = (level: VerificationLevel): number =>
  ENUMS.verification_level.indexOf(level);

const unavailable = () =>
  err<VerificationErrorDetails>("VALIDATION", "That check is not available", {
    reason: "unsupported-evidence",
  });

const toSection = (
  section: VerificationSection | "contact",
  row: MemorySectionRow,
): SectionState => ({
  section,
  status: row.status,
  ...(row.evidenceType === undefined ? {} : { evidenceType: row.evidenceType }),
  ...(row.submissionId === undefined ? {} : { submissionId: row.submissionId }),
  ...(section === "identity" ? { attempts: row.attempts } : {}),
  ...(row.rejectionReason === undefined
    ? {}
    : { rejectionReason: row.rejectionReason }),
  ...(row.guidanceKey === undefined ? {} : { guidanceKey: row.guidanceKey }),
  ...(row.statusAt === undefined ? {} : { statusAt: row.statusAt }),
});

const stateOf = (
  nannyId: UserId,
  row: MemoryVerificationRow,
): VerificationState => ({
  nannyId,
  level: row.level,
  suspended: row.suspended,
  sections: [
    { section: "contact", status: row.contact },
    toSection("identity", row.identity),
    toSection("dbs", row.dbs),
    toSection("right-to-work", row.rightToWork),
  ],
});

/** ADR-157 (1) in the memory world: the same facts the SQL reads, the same rule, one writer of `level`. */
function syncRow(row: MemoryVerificationRow): {
  readonly next: MemoryVerificationRow;
  readonly sync: LevelSync;
} {
  const toLevel = deriveLevel(
    {
      sections: {
        identity: row.identity.status,
        dbs: row.dbs.status,
        "right-to-work": row.rightToWork.status,
      },
      dbsOutcome: row.dbsOutcome ?? "unset",
      crossCheckPassed: row.crossCheckPassed ?? false,
      updateServiceConfirmed:
        row.updateService?.result === "no_change" &&
        row.updateService.checkedBy !== undefined,
    },
    VETTING.requiredChecksByLevel,
  );
  const suspended = row.dbsOutcome === "barred";
  const released =
    toLevel === "L4_FULLY_VERIFIED" ? (row.heldConnections ?? 0) : 0;
  return {
    next: {
      ...row,
      level: toLevel,
      suspended,
      heldConnections: (row.heldConnections ?? 0) - released,
    },
    sync: { fromLevel: row.level, toLevel, suspended, released },
  };
}

const KEY_OF: Readonly<
  Record<VerificationSection, "identity" | "dbs" | "rightToWork">
> = Object.freeze({
  identity: "identity",
  dbs: "dbs",
  "right-to-work": "rightToWork",
});

const OPEN: ReadonlySet<string> = new Set([
  "not_started",
  "rejected",
  "failed",
  "expired",
]);

const opt = <K extends string, V>(key: K, value: V | undefined) =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

function recordOf(
  nannyId: NannyId,
  userId: UserId,
  row: MemoryVerificationRow | undefined,
): AdminRecord | null {
  if (row === undefined) return null;
  const d = row.declared ?? {};
  const us = row.updateService ?? {};
  return {
    nannyId,
    userId,
    level: row.level,
    suspended: row.suspended,
    declared: {
      ...opt("surname", d.surname),
      ...opt("givenNames", d.givenNames),
      ...opt("dateOfBirth", d.dateOfBirth as never),
      ...opt("idType", d.idType as never),
      ...opt("certificateNumber", d.certificateNumber),
      ...opt("issueDate", d.issueDate as never),
      ...opt("rtwKind", d.kind as never),
      ...opt("shareCode", d.shareCode),
    },
    documents: (row.documents ?? []).map((doc) => ({
      section: doc.section as never,
      ref: { bucket: "verification-documents", path: doc.path },
    })),
    dbsOutcome: row.dbsOutcome ?? "unset",
    crossCheckPassed: row.crossCheckPassed ?? false,
    updateService: {
      ...opt("consentAt", us.consentAt),
      ...opt("lastCheckedAt", us.checkedAt),
      ...opt("lastResult", us.result),
      ...opt("subscribed", us.subscribed),
    },
  };
}

export function memoryVerificationStore(
  ledger: MemoryVettingStore,
): VerificationStore & VerificationDecisionStore {
  const session = async (): Promise<
    Result<UserId, VerificationErrorDetails>
  > => {
    const current = await auth.getCurrentUserId();
    if (!current.ok || current.value === null) return NO_SESSION;
    return ok(current.value);
  };
  // ★ ADR-169 — the double crosses the seam through the ledger's own named resolution, never by reusing an id.
  const sync = (nannyId: NannyId): LevelSync => {
    let out: LevelSync | undefined;
    ledger.patchSections(nannyId, (row) => {
      const synced = syncRow(row);
      out = synced.sync;
      return synced.next;
    });
    return out ?? syncRow(ledger.sectionsOf(nannyId)!).sync;
  };

  return Object.freeze({
    // The nanny's own read arrives with her SESSION id (R-7), as it does in production.
    getStatus: async (nannyId) => {
      const row = ledger.sectionsOf(ledger.partyIdOf(nannyId));
      return ok(row === undefined ? null : stateOf(nannyId, row));
    },
    partyIdOf: async (userId) =>
      ok(
        ledger.sectionsOf(ledger.partyIdOf(userId)) === undefined
          ? null
          : ledger.partyIdOf(userId),
      ),
    saveContact: async () => {
      const user = await session();
      if (!user.ok) return user;
      ledger.patchSections(ledger.partyIdOf(user.value), (row) => ({
        ...row,
        contact: "verified",
      }));
      return ok(undefined);
    },
    claimProcessing: async () => {
      const user = await session();
      if (!user.ok) return user;
      const claimed: VerificationSection[] = [];
      ledger.patchSections(ledger.partyIdOf(user.value), (row) => {
        const claim = (
          key: "identity" | "dbs" | "rightToWork",
          name: VerificationSection,
        ): MemorySectionRow => {
          if (row[key].status !== "pending") return row[key];
          claimed.push(name);
          return { ...row[key], status: "processing", statusAt: nowInstant() };
        };
        return {
          ...row,
          identity: claim("identity", "identity"),
          dbs: claim("dbs", "dbs"),
          rightToWork: claim("rightToWork", "right-to-work"),
        };
      });
      return ok(claimed);
    },
    applyCheckResult: async ({ submissionId, status }) => {
      const applied = ledger.applyResult(submissionId, status);
      if (!applied.ok) return unavailable();
      const section = sectionOfLedger(applied.value.section);
      if (section === null) return unavailable();
      return ok({ section, status: applied.value.status });
    },

    // ── the decision side (ADR-157) ──
    readAdminRecord: async (nannyId) =>
      ok(
        recordOf(
          nannyId,
          ledger.userIdOf(nannyId),
          ledger.sectionsOf(nannyId),
        ),
      ),
    syncLevel: async (nannyId) =>
      ledger.sectionsOf(nannyId) === undefined
        ? ok({
            fromLevel: "L0_SIGNED_UP",
            toLevel: "L0_SIGNED_UP",
            suspended: false,
            released: 0,
          } as LevelSync)
        : ok(sync(nannyId)),
    recordUpdateServiceCheck: async (input) => {
      if (ledger.sectionsOf(input.nannyId) === undefined) return unavailable();
      ledger.patchSections(input.nannyId, (row) => ({
        ...row,
        updateService: {
          ...(row.updateService ?? {}),
          result: input.result,
          subscribed: input.subscribed,
          checkedBy: input.checkedBy,
          checkedAt: nowInstant(),
        },
        dbs:
          input.result === "new_information"
            ? { ...row.dbs, status: "review", statusAt: nowInstant() }
            : row.dbs,
      }));
      return ok(sync(input.nannyId));
    },
    expireSection: async (submissionId) => {
      const entry = ledger
        .rows()
        .find((row) => row.submissionId === submissionId);
      const section =
        entry === undefined ? null : sectionOfLedger(entry.section);
      if (entry === undefined || section === null) return unavailable();
      const key = KEY_OF[section];
      ledger.patchSections(entry.nannyId, (row) => ({
        ...row,
        [key]: { ...row[key], status: "expired", statusAt: nowInstant() },
      }));
      return ok(sync(entry.nannyId));
    },
    sweepStale: async (staleMinutes, now) => {
      const cutoff = Date.parse(now) - staleMinutes * MINUTE_MS;
      let moved = 0;
      for (const nannyId of ledger.nannyIds())
        ledger.patchSections(nannyId, (row) => {
          const sweep = (s: MemorySectionRow): MemorySectionRow => {
            if (
              s.status !== "processing" ||
              s.statusAt === undefined ||
              Date.parse(s.statusAt) >= cutoff
            )
              return s;
            moved += 1;
            return { ...s, status: "review", statusAt: nowInstant() };
          };
          return {
            ...row,
            identity: sweep(row.identity),
            dbs: sweep(row.dbs),
            rightToWork: sweep(row.rightToWork),
          };
        });
      return ok(moved);
    },
    listExpiries: async () =>
      ok(
        ledger.nannyIds().flatMap((nannyId) => {
          const row = ledger.sectionsOf(nannyId);
          if (row === undefined) return [];
          // The expiry sweep addresses her (`vetting.expiry-approaching` carries a mailbox), so it speaks the
          // session id — ADR-169's seam, crossed through the ledger's own named resolution.
          const userId = ledger.userIdOf(nannyId);
          return (
            [
              ["identity", row.identity],
              ["dbs", row.dbs],
              ["right-to-work", row.rightToWork],
            ] as const
          ).flatMap(([section, s]) =>
            s.status === "verified" &&
            s.expiresAt !== undefined &&
            s.submissionId !== undefined
              ? [
                  {
                    nannyId: userId,
                    section,
                    submissionId: s.submissionId,
                    expiresAt: s.expiresAt,
                  },
                ]
              : [],
          );
        }),
      ),
    listRemindable: async (belowLevel) =>
      ok(
        ledger.nannyIds().flatMap((nannyId) => {
          const row = ledger.sectionsOf(nannyId);
          if (row === undefined || rank(row.level) >= rank(belowLevel))
            return [];
          const sections = [row.identity, row.dbs, row.rightToWork];
          if (!sections.some((s) => OPEN.has(s.status))) return [];
          const last = sections
            .map((s) => s.statusAt)
            .filter((at): at is NonNullable<typeof at> => at !== undefined)
            .sort()
            .at(-1);
          return last === undefined
            ? []
            : [
                {
                  nannyId: ledger.userIdOf(nannyId),
                  level: row.level,
                  lastChangeAt: last,
                },
              ];
        }),
      ),
    countByLevel: async () => {
      const counts = Object.fromEntries(
        ENUMS.verification_level.map((level) => [level, 0]),
      ) as Record<VerificationLevel, number>;
      for (const nannyId of ledger.nannyIds()) {
        const row = ledger.sectionsOf(nannyId);
        if (row !== undefined) counts[row.level] += 1;
      }
      return ok(counts);
    },
  });
}
