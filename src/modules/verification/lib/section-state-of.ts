// One section's state out of a `VerificationState`, defaulting to `not_started` (I-V1: a section that has never
// been written reads as not started).
import type { SectionState, VerificationState, WizardSection } from "../types";

export function sectionStateOf(
  state: VerificationState | null,
  section: WizardSection,
): SectionState {
  return (
    state?.sections.find((entry) => entry.section === section) ?? {
      section,
      status: "not_started",
    }
  );
}
