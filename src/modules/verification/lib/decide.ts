// The decision road (ADR-159; 03 §4.3 "per tab, `getProvider(type)` is a `ManualDecisionProvider` ? `record` :
// `override`"): authority from the session (`requireAdmin`), the audit subject from the SUBMISSION (its nanny —
// never an id the caller supplied; 07 §5.4 row 6, ADR-145's pattern), `adminRoutes` consumed (07 §8 row 14),
// then the bound provider's `record()` — which under `stub-manual` is `record_vetting_decision()`: the ledger,
// the section, for DBS the outcome and the cross-check, and the sync, in one transaction (ADR-157 (2)). The
// level BEFORE is read first so the one `verification.level-changed` names a real move; the events and the
// outcome comms follow the write; the answer is the state the sync left.
import { err, log, nowInstant } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import { getProvider, readSubmission } from "@/modules/vetting-providers";
import type { ManualDecisionProvider } from "@/modules/vetting-providers";
import type {
  DecisionInput,
  DecisionOutcome,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";
import { consumeAdminRouteLimit } from "./consume-admin-route-limit";
import { emitLevelEvents } from "./emit-level-events";
import { requireAdmin } from "./require-admin";
import { sectionOfLedger } from "./section-of-ledger";
import { sectionStateOf } from "./section-state-of";
import { sendVerificationOutcome } from "./send-verification-outcome";

const unavailable = () =>
  err<VerificationErrorDetails>("VALIDATION", "That check is not available", {
    reason: "unsupported-evidence",
  });

const reasonRequired = () =>
  err<VerificationErrorDetails>("VALIDATION", "A rejection needs a reason.", {
    reason: "reason-required",
    field: "reason",
  });

export async function decide(
  deps: VerificationDeps,
  input: DecisionInput,
): Promise<Result<DecisionOutcome, VerificationErrorDetails>> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;
  const entry = await readSubmission(input.submissionId);
  if (!entry.ok) return entry as Result<never, VerificationErrorDetails>;
  const section =
    entry.value === null ? null : sectionOfLedger(entry.value.section);
  if (entry.value === null || section === null) return unavailable();
  if (input.decision === "rejected" && input.reason === undefined)
    return reasonRequired();
  const limited = await consumeAdminRouteLimit(admin.value);
  if (!limited.ok) return limited;

  const provider = getProvider(entry.value.evidenceType);
  if (!provider.ok) return unavailable();
  if (!("record" in provider.value))
    // 03 §4.3's other arm — no such provider is bound (03 §4.4), so this stays the refused road
    return err("INTERNAL", "That decision road is not built yet.", {
      reason: "not-built",
    });

  const nannyId = entry.value.nannyId;
  const before = await deps.store.getStatus(nannyId);
  if (!before.ok) return before;
  const fromLevel = before.value?.level ?? "L0_SIGNED_UP";

  const recorded = await (provider.value as ManualDecisionProvider).record({
    submissionId: input.submissionId,
    decision: input.decision,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.note === undefined ? {} : { note: input.note }),
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    actor: { kind: "admin", id: admin.value.adminId },
  });
  if (!recorded.ok) {
    log.warn("verification decision refused by the provider", {
      module: "verification",
      action: "decide",
      reason: recorded.error.details?.reason ?? recorded.error.code,
    });
    return err("INTERNAL", "That decision could not be recorded.", {
      reason: "store-failed",
    });
  }

  // The sync ran inside the definer (idempotent to ask again); the memory double derives here (ADR-157).
  const synced = await deps.store.syncLevel(nannyId);
  if (!synced.ok) return synced;
  const sync = { ...synced.value, fromLevel };
  const state = await deps.store.getStatus(nannyId);
  if (!state.ok) return state;
  await emitLevelEvents(nannyId, sync);
  await sendVerificationOutcome({
    nannyId,
    sync,
    now: nowInstant(),
    ...(input.decision === "rejected"
      ? { rejected: { section, guidanceKey: input.reason ?? "mismatch" } }
      : {}),
  });
  return {
    ok: true,
    value: {
      nannyId,
      section,
      status: sectionStateOf(state.value, section).status,
      sync,
    },
  };
}
