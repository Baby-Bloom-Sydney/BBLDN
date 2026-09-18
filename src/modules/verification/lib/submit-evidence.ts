// The road the four submit paths share once the inputs are assembled (03 §4.3 "each calls
// `getProvider(type).submit(evidence)`"): every evidence goes to the provider config binds; a refusal after an
// upload removes what was uploaded; a success emits `verification.submitted` and answers the section's state.
import { comms } from "@/modules/comms";
import { Events, err, log } from "@/modules/platform";
import type { Evidence, Result, UserId } from "@/modules/shared-types";
import { getProvider } from "@/modules/vetting-providers";
import type { VettingErrorDetails } from "@/modules/vetting-providers";
import type {
  EvidenceRef,
  SectionState,
  VerificationErrorDetails,
  VerificationSection,
  VerificationStore,
} from "../types";
import { REMINDER_KEYS } from "./reminder-keys";
import { sectionStateOf } from "./section-state-of";

const CHECK_OF: Readonly<
  Record<VerificationSection, "id" | "dbs" | "right-to-work">
> = Object.freeze({
  identity: "id",
  dbs: "dbs",
  "right-to-work": "right-to-work",
});

const asVerification = <T>(
  result: Result<T, VettingErrorDetails>,
): Result<T, VerificationErrorDetails> =>
  result as Result<T, VerificationErrorDetails>;

export async function submitEvidence(
  store: VerificationStore,
  nannyId: UserId,
  section: VerificationSection,
  evidences: ReadonlyArray<Evidence>,
  uploaded: ReadonlyArray<EvidenceRef>,
  undo: (refs: ReadonlyArray<EvidenceRef>) => Promise<void>,
): Promise<Result<SectionState, VerificationErrorDetails>> {
  for (const evidence of evidences) {
    const provider = getProvider(evidence.type);
    if (!provider.ok) {
      await undo(uploaded);
      return asVerification(provider);
    }
    const submitted = await provider.value.submit(evidence);
    if (!submitted.ok) {
      await undo(uploaded);
      log.warn("evidence submission refused", {
        module: "verification",
        action: "submitSection",
        section,
        reason: submitted.error.details?.reason ?? submitted.error.code,
      });
      return err(
        submitted.error.code,
        "We couldn't save that just now. Try again in a moment.",
        {
          reason:
            submitted.error.details?.reason === "unsupported-evidence"
              ? "unsupported-evidence"
              : "store-failed",
        },
      );
    }
  }
  // 03 §8.2 row 30: "cancelled on resubmission" — a queued action-needed nudge for this section is withdrawn
  const cancelled = await comms.cancel(REMINDER_KEYS.actionNeeded(nannyId, section));
  if (!cancelled.ok)
    log.warn("verification-action-needed not cancelled", {
      module: "verification",
      action: "submitSection",
      section,
      errorCode: cancelled.error.code as never,
    });
  const emitted = await Events.emit({
    name: "verification.submitted",
    actor: { kind: "user", id: nannyId, role: "nanny" },
    props: { nannyId, check: CHECK_OF[section] },
  });
  if (!emitted.ok)
    log.warn("verification.submitted not recorded", {
      module: "verification",
      action: "submitSection",
      reason: emitted.error.details?.reason ?? emitted.error.code,
    });
  const state = await store.getStatus(nannyId);
  if (!state.ok) return state;
  return { ok: true, value: sectionStateOf(state.value, section) };
}
