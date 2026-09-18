// S-N-08 (03 §4.3 "Processing (atomic claim)"): claim every pending section (I-V4), then for each — the latest
// submission per evidence type — ask the bound provider to `check` and apply what it answers. With
// `stub-manual` every answer is `needs-admin`, so every claimed section lands in `review` and the admin queue
// (2c) takes it from there. A provider that cannot answer leaves the section `processing` for the stale
// sweep (2c's named job), logged, never guessed.
import { comms } from "@/modules/comms";
import { err, log, nowInstant } from "@/modules/platform";
import type { NannyId, Result, UserId, Uuid } from "@/modules/shared-types";
import { getProvider, listSubmissions } from "@/modules/vetting-providers";
import type { VettingLedgerEntry } from "@/modules/vetting-providers";
import type {
  VerificationDeps,
  VerificationErrorDetails,
  VerificationSection,
  VerificationState,
} from "../types";
import { emitLevelEvents } from "./emit-level-events";
import { ledgerSectionOf } from "./ledger-section-of";
import { REMINDER_KEYS } from "./reminder-keys";
import { requireOwnNanny } from "./require-own-nanny";

/** 03 §8.2 row 28 — "we've got it, a person is checking" once per day of submitting (2c); never fails the step. */
async function sendPending(nannyId: UserId): Promise<void> {
  const sent = await comms.send({
    channel: "email",
    templateId: "verification-pending",
    to: { userId: nannyId as string as Uuid },
    data: {},
    dedupeKey: REMINDER_KEYS.pending(nannyId, nowInstant().slice(0, 10)),
  });
  if (!sent.ok)
    log.warn("verification-pending not sent", {
      module: "verification",
      action: "process",
      errorCode: sent.error.code as never,
    });
}

const latestPerType = (
  entries: ReadonlyArray<VettingLedgerEntry>,
): ReadonlyArray<VettingLedgerEntry> =>
  [...entries]
    .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
    .filter(
      (entry, index, all) =>
        all.findIndex((e) => e.evidenceType === entry.evidenceType) === index,
    );

async function checkSection(
  deps: VerificationDeps,
  nannyId: NannyId,
  section: VerificationSection,
): Promise<void> {
  const listed = await listSubmissions({
    nannyId,
    section: ledgerSectionOf(section),
  });
  if (!listed.ok) {
    log.warn("processing: ledger unreadable; section left processing", {
      module: "verification",
      action: "process",
      section,
    });
    return;
  }
  for (const entry of latestPerType(listed.value)) {
    const provider = getProvider(entry.evidenceType);
    if (!provider.ok) continue;
    const checked = await provider.value.check(entry.submissionId);
    if (!checked.ok) {
      log.warn("processing: provider did not answer; section left processing", {
        module: "verification",
        action: "process",
        section,
        provider: provider.value.id,
        alert: "ALERT_PROVIDER_DOWN",
      });
      continue;
    }
    const applied = await deps.store.applyCheckResult({
      submissionId: entry.submissionId,
      status: checked.value.status,
      checkedBy: provider.value.id === "stub-manual" ? "none" : "ai",
      ...(checked.value.extracted === undefined
        ? {}
        : { extracted: checked.value.extracted }),
    });
    if (!applied.ok)
      log.warn("processing: result not applied", {
        module: "verification",
        action: "process",
        section,
        reason: applied.error.details?.reason ?? applied.error.code,
      });
  }
}

export async function processSections(
  deps: VerificationDeps,
  nannyId: UserId,
): Promise<Result<VerificationState, VerificationErrorDetails>> {
  const own = await requireOwnNanny(nannyId);
  if (!own.ok) return own;
  // ★ ADR-169 — this road arrives with the SESSION's id (it is her own processing step) and the ledger and the
  // sync both speak the party row's. The crossing is one named call at the top, the read-side mirror of the
  // resolution every session-scope definer does inside itself. Before ADR-169 the ledger filter below was
  // handed a session id and matched nothing, so `processSections` never saw the submissions it had just claimed.
  const party = await deps.store.partyIdOf(nannyId);
  if (!party.ok) return party;
  if (party.value === null)
    // `requireOwnNanny` has already passed, so a missing party row is an inconsistency, not a state she can be
    // in: refuse rather than process against an id that resolves to nothing.
    return err<VerificationErrorDetails>(
      "INTERNAL",
      "We couldn't check that just now.",
      { reason: "store-failed" },
    );
  const partyId = party.value;
  const claimed = await deps.store.claimProcessing();
  if (!claimed.ok) return claimed;
  for (const section of claimed.value)
    await checkSection(deps, partyId, section);
  if (claimed.value.length > 0) await sendPending(nannyId);
  // ADR-157: L1 ("identity submitted") has no writer but the sync, and nothing decides before a person does —
  // so the processing step asks for it here (the boot adapter runs it at service scope; module README).
  const synced = await deps.store.syncLevel(partyId);
  if (synced.ok) await emitLevelEvents(nannyId, synced.value);
  const state = await deps.store.getStatus(nannyId);
  if (!state.ok) return state;
  return { ok: true, value: state.value ?? emptyState(nannyId) };
}

const emptyState = (nannyId: UserId): VerificationState => ({
  nannyId,
  level: "L0_SIGNED_UP",
  suspended: false,
  sections: [
    { section: "contact", status: "not_started" },
    { section: "identity", status: "not_started", attempts: 0 },
    { section: "dbs", status: "not_started" },
    { section: "right-to-work", status: "not_started" },
  ],
});
