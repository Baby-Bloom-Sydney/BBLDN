// `stub-manual` (03 §4.4; kickoff §4.4) — the day-one binding for every `EvidenceType`: the admin verifies by
// hand from the queue, and nothing in the wizard, the status model or the queue knows it is a stub. Its ONLY
// outcome is `needs-admin` (ADR-154): it reads no document, opens no storage path, extracts nothing, and never
// answers `verified` — so binding it cannot make a nanny look verified (REVIEW-1 M-9, answered by construction).
import { VETTING } from "@/modules/config";
import { err, nowInstant, ok } from "@/modules/platform";
import type { Actor, EvidenceType } from "@/modules/shared-types";
import type { ManualDecisionProvider, VettingErrorDetails } from "./types";
import { emitVettingEvent } from "./lib/emit-vetting-event";
import { VETTING_STORE_REGISTRY } from "./lib/vetting-store-registry";

const PROVIDER_ID = "stub-manual";
const ACCEPTED: ReadonlySet<string> = new Set(VETTING.acceptedEvidence);

const unsupported = () =>
  err<VettingErrorDetails>("VALIDATION", "That evidence is not accepted", {
    reason: "unsupported-evidence",
    provider: PROVIDER_ID,
  });

export const stubManualProvider: ManualDecisionProvider = Object.freeze({
  id: PROVIDER_ID,
  supports: (evidenceType: EvidenceType) => ACCEPTED.has(evidenceType),
  submit: async (evidence) => {
    if (!ACCEPTED.has(evidence.type)) return unsupported();
    const store = VETTING_STORE_REGISTRY.get();
    const existing = await store.findByEvidence(evidence.id);
    if (!existing.ok) return existing;
    if (existing.value !== null) return ok(existing.value);
    const submitted = await store.upsert({
      evidence,
      provider: PROVIDER_ID,
      status: { kind: "needs-admin" },
    });
    if (!submitted.ok) return submitted;
    const props = {
      submissionId: submitted.value.submissionId,
      evidenceType: evidence.type,
      provider: PROVIDER_ID,
      statusKind: "needs-admin",
    };
    // 03 §9.3: every event but the decision is hers, and `submit` genuinely holds her session id.
    const hers: Actor = {
      kind: "user",
      id: evidence.nannyId,
      role: "nanny",
    };
    await emitVettingEvent("vetting.submitted", hers, props);
    await emitVettingEvent("vetting.needs-admin", hers, props);
    return submitted;
  },
  check: async (submissionId) => {
    const stored = await VETTING_STORE_REGISTRY.get().read(submissionId);
    if (!stored.ok) return stored;
    if (stored.value === null) return unsupported();
    return ok({
      submissionId,
      status: stored.value.status,
      checkedAt: nowInstant(),
    });
  },
  // 03 §4.4: the stub extracts nothing, so identity and DBS route to needs-admin and the surname cross-check
  // waits on the admin's typed value. It never opens a document to do it.
  extract: async () => ok({ consistency: [] }),
  expiry: async () =>
    ok({ expiresAt: null, renewable: false, source: "policy" as const }),
  record: async (input) => {
    const store = VETTING_STORE_REGISTRY.get();
    const entry = await store.read(input.submissionId);
    if (!entry.ok) return entry;
    const recorded = await store.recordDecision(input);
    if (!recorded.ok) return recorded;
    if (entry.value !== null)
      // 03 §9.3 / 07 §5.4 row 6: the actor is the admin who decided, the subject the submission's nanny.
      // ★ ADR-169: the subject is her `auth.users.id`, handed down by the caller that already resolved it —
      // `entry.value.nannyId` is the party row and would name nobody the audit log can be joined on. Without
      // one the event is emitted with no subject rather than with a wrong one.
      await emitVettingEvent(
        "vetting.decision-recorded",
        input.onBehalfOf === undefined
          ? { kind: "admin", id: input.actor.id }
          : {
              kind: "admin",
              id: input.actor.id,
              onBehalfOf: { role: "nanny", id: input.onBehalfOf },
            },
        {
          submissionId: input.submissionId,
          evidenceType: entry.value.evidenceType,
          provider: PROVIDER_ID,
          decision: input.decision,
        },
      );
    return recorded;
  },
});
