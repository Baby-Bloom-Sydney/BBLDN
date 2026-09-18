// `03.21` — the wizard reopens at the first incomplete step. A section still to be started, or sent back
// (`rejected` · `failed` · `expired`), is where she resumes; one that is `pending`, `processing`, `review` or
// `verified` is not hers to touch. Everything submitted and something still `pending` → the processing step;
// everything settled → the status page (S-N-09).
import type {
  SectionStatus,
  VerificationState,
  WizardPosition,
} from "../types";
import { WIZARD_STEPS } from "./wizard-steps";

const OPEN: ReadonlySet<SectionStatus> = new Set([
  "not_started",
  "rejected",
  "failed",
  "expired",
]);

export function firstIncompleteStep(
  state: VerificationState | null,
): WizardPosition {
  if (state === null) return 0;
  const statusOf = (section: string): SectionStatus =>
    state.sections.find((entry) => entry.section === section)?.status ??
    "not_started";
  if (statusOf("contact") !== "verified") return 0;
  for (const step of WIZARD_STEPS) {
    if (step.section === null || step.section === "contact") continue;
    if (OPEN.has(statusOf(step.section))) return step.index;
  }
  const pending = state.sections.some((entry) => entry.status === "pending");
  return pending ? WIZARD_STEPS.length - 1 : "status";
}
