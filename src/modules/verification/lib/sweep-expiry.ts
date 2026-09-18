// `vetting-expiry` (01 §4f; 03 §4.3; ADR-157 (4)): every verified section with a known expiry is walked once a
// day — inside `VETTING.expiryLeadDays` it warns (`vetting.expiry-approaching`), past its date it lapses
// (`expire_verification_section()` → the section `expired`, the level recomputed, `vetting.expired`). No message
// to the nanny beyond S-N-09's "Expired — please send it again": 03 §8.2 names no expiry template, so none is sent.
import { VETTING } from "@/modules/config";
import { log, ok } from "@/modules/platform";
import type { Instant, Result } from "@/modules/shared-types";
import type {
  SectionExpiry,
  SweepResult,
  VerificationDeps,
  VerificationErrorDetails,
} from "../types";
import { emitLevelEvents } from "./emit-level-events";
import { emitVerificationEvent } from "./emit-verification-event";
import { ledgerSectionOf } from "./ledger-section-of";

const DAY_MS = 86_400_000;

const EVIDENCE_OF = Object.freeze({
  identity: "identity-document",
  dbs: "dbs-certificate",
  "right-to-work": "right-to-work-document",
} as const);

async function expire(
  deps: VerificationDeps,
  row: SectionExpiry,
): Promise<boolean> {
  const synced = await deps.store.expireSection(row.submissionId);
  if (!synced.ok) {
    log.warn("verification section not expired", {
      module: "verification",
      action: "sweepExpiry",
      section: ledgerSectionOf(row.section),
      reason: synced.error.details?.reason ?? synced.error.code,
    });
    return false;
  }
  await emitVerificationEvent({
    name: "vetting.expired",
    actor: { kind: "system", id: "vetting-expiry" },
    props: {
      submissionId: row.submissionId,
      evidenceType: EVIDENCE_OF[row.section],
      provider: "stub-manual",
      expiresAt: row.expiresAt,
    },
  });
  await emitLevelEvents(row.nannyId, synced.value);
  return true;
}

export async function sweepExpiry(
  deps: VerificationDeps,
  now: Instant,
): Promise<Result<SweepResult, VerificationErrorDetails>> {
  const listed = await deps.store.listExpiries();
  if (!listed.ok) return listed;
  const at = Date.parse(now);
  const lead = at + VETTING.expiryLeadDays * DAY_MS;
  let handled = 0;
  let skipped = 0;
  for (const row of listed.value) {
    const expiresAt = Date.parse(row.expiresAt);
    if (expiresAt <= at) {
      if (await expire(deps, row)) handled += 1;
      else skipped += 1;
    } else if (expiresAt <= lead) {
      await emitVerificationEvent({
        name: "vetting.expiry-approaching",
        actor: { kind: "system", id: "vetting-expiry" },
        props: {
          submissionId: row.submissionId,
          evidenceType: EVIDENCE_OF[row.section],
          provider: "stub-manual",
          expiresAt: row.expiresAt,
        },
      });
      handled += 1;
    } else skipped += 1;
  }
  return ok({ handled, skipped });
}
