// `stub-manual` (03 §4.4) — the day-one binding for every `EvidenceType`: the admin verifies by hand, and
// nothing in the wizard, the status model or the queue knows it is a stub.
//
// **ADR-117 Tier A — this is the connector shell, not the inside.** It reads no document, opens no storage
// path and calls no provider: `supports` answers from `config/vetting.ts` (pure), and every other method
// delegates to the `VettingSubmissionStore` port, which is unconfigured until a reviewed unit installs it.
import { VETTING } from "@/modules/config";
import { err, nowInstant, ok } from "@/modules/platform";
import type { EvidenceType } from "@/modules/shared-types";
import type { ManualDecisionProvider, VettingErrorDetails } from "./types";
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
    const existing = await VETTING_STORE_REGISTRY.get().findByEvidence(
      evidence.id,
    );
    if (!existing.ok) return existing;
    if (existing.value !== null) return ok(existing.value);
    return VETTING_STORE_REGISTRY.get().upsert({
      evidenceId: evidence.id,
      provider: PROVIDER_ID,
      status: { kind: "needs-admin" },
    });
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
  record: async (input) => VETTING_STORE_REGISTRY.get().recordDecision(input),
});
