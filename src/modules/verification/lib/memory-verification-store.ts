// The test double behind the store port (05 §3 rule 2), over `vetting-providers`' memory world so what `0022`'s
// definers do in one transaction the two doubles do in one call: the section reads `pending` the moment the
// ledger row exists, the contact stamp and the processing claim act for the SESSION's nanny (as `auth.uid()`
// does), and the provider-side result moves the section the way `apply_vetting_check_result()` does.
import { auth } from "@/modules/auth";
import { err, ok } from "@/modules/platform";
import type { Result, UserId } from "@/modules/shared-types";
import type {
  MemorySectionRow,
  MemoryVettingStore,
} from "@/modules/vetting-providers";
import type {
  SectionState,
  VerificationErrorDetails,
  VerificationSection,
  VerificationState,
  VerificationStore,
} from "../types";
import { sectionOfLedger } from "./section-of-ledger";

const NO_SESSION = err<VerificationErrorDetails>(
  "UNAUTHENTICATED",
  "Sign in to continue.",
  {
    reason: "not-permitted",
  },
);

const toSection = (
  section: VerificationSection | "contact",
  row: MemorySectionRow,
): SectionState => ({
  section,
  status: row.status,
  ...(row.evidenceType === undefined ? {} : { evidenceType: row.evidenceType }),
  ...(section === "identity" ? { attempts: row.attempts } : {}),
  ...(row.rejectionReason === undefined
    ? {}
    : { rejectionReason: row.rejectionReason }),
  ...(row.guidanceKey === undefined ? {} : { guidanceKey: row.guidanceKey }),
  ...(row.statusAt === undefined ? {} : { statusAt: row.statusAt }),
});

export function memoryVerificationStore(
  ledger: MemoryVettingStore,
): VerificationStore {
  const session = async (): Promise<
    Result<UserId, VerificationErrorDetails>
  > => {
    const current = await auth.getCurrentUserId();
    if (!current.ok || current.value === null) return NO_SESSION;
    return ok(current.value);
  };
  return Object.freeze({
    getStatus: async (nannyId) => {
      const row = ledger.sectionsOf(nannyId);
      if (row === undefined) return ok(null);
      const state: VerificationState = {
        nannyId,
        level: row.level,
        suspended: row.suspended,
        sections: [
          { section: "contact", status: row.contact },
          toSection("identity", row.identity),
          toSection("dbs", row.dbs),
          toSection("right-to-work", row.rightToWork),
        ],
      };
      return ok(state);
    },
    saveContact: async () => {
      const user = await session();
      if (!user.ok) return user;
      ledger.patchSections(user.value, (row) => ({
        ...row,
        contact: "verified",
      }));
      return ok(undefined);
    },
    claimProcessing: async () => {
      const user = await session();
      if (!user.ok) return user;
      const claimed: VerificationSection[] = [];
      ledger.patchSections(user.value, (row) => {
        const claim = (
          key: "identity" | "dbs" | "rightToWork",
          name: VerificationSection,
        ): MemorySectionRow => {
          if (row[key].status !== "pending") return row[key];
          claimed.push(name);
          return { ...row[key], status: "processing" };
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
      if (!applied.ok)
        return err("VALIDATION", "That check is not available", {
          reason: "unsupported-evidence",
        });
      const section = sectionOfLedger(applied.value.section);
      if (section === null)
        return err("VALIDATION", "That check is not available", {
          reason: "unsupported-evidence",
        });
      return ok({ section, status: applied.value.status });
    },
  });
}
