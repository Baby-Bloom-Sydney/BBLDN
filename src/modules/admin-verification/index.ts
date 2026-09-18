// admin-verification connector (01 §2.3) — the verification queue S-A-16 and the reference crib S-A-17. It imports
// `verification` and never `vetting-providers`: every provider call goes through `verification` (03 §4.2).
// Built by L-008 `2c` (ADR-159): the read, the three actions the route passes to the screen, the two screens.
export type * from "./types";

// Server reads the route files call (05 §7 rule 5).
export { loadVerificationQueue } from "./lib/load-verification-queue";
export { parseQueueQuery } from "./lib/parse-queue-query";

// The three actions (01 §4e) — route files pass them to the screens as props.
export { decideSubmissionAction } from "./actions/decide-submission-action";
export { openEvidenceAction } from "./actions/open-evidence-action";
export { recordUpdateServiceAction } from "./actions/record-update-service-action";

// Screens.
export { VerificationQueue } from "./components/VerificationQueue";
export { VerificationReference } from "./components/VerificationReference";
