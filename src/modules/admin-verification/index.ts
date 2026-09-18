// admin-verification connector (01 §2.3) — the verification queue S-A-16 and the reference crib S-A-17. It imports
// `verification` and never `vetting-providers`: every provider call goes through `verification` (03 §4.2).
// Built by L-008 `2c` (ADR-159): the read, the three actions the route passes to the screen, the two screens.
export type * from "./types";

// Server reads the route files call (05 §7 rule 5).
export { loadVerificationQueue } from "./lib/load-verification-queue";
/**
 * `2d` — a nanny's name for an **admin** surface, keyed on her `auth.users` id (`user_profiles`, session scope;
 * an admin reads every profile under 07 §5.2 and RLS is the second gate). Exported so the call queue's drawer
 * uses this rather than a second copy: `nanny_public` cannot answer an admin's question — it is keyed on
 * `nannies.id`, it deliberately carries no `user_id` (07 §5.2; the ADR-103 review's M1, pinned in `int.rls`),
 * and it excludes exactly the nannies an admin surface is about.
 */
export { nannyNameOf } from "./lib/nanny-name-of";
export { parseQueueQuery } from "./lib/parse-queue-query";

// The four actions (01 §4e) — route files pass them to the screens as props.
export { decideSubmissionAction } from "./actions/decide-submission-action";
export { openEvidenceAction } from "./actions/open-evidence-action";
export { recordUpdateServiceAction } from "./actions/record-update-service-action";
export { liftSuspensionAction } from "./actions/lift-suspension-action";

// Screens.
export { VerificationQueue } from "./components/VerificationQueue";
export { VerificationReference } from "./components/VerificationReference";
