// matching connector (01 §2.5; 03 §7.4) — quick match, advanced match, results, the pre-auth wizard and the
// `autofire` pre-check task. It is the **only** caller of `scoring` (03 §7.2), and it calls `positions`' stage-model
// connector rather than being called by it (fix: A-1 / R2). May import `positions` · `scoring` · `areas` (S) ·
// `auth` (S) · `platform` (S). Phase 1 `1b` gave it an inside (`createMatching`), the marketplace-safe nanny read,
// the wizard lead, the ADR-126 Connect entry point, and the S-X-02 / S-X-03 / S-X-04 screens.
export type * from "./types";

export { matching } from "./lib/default-matching";
export { configureMatching } from "./lib/configure-matching";
export { createMatching } from "./lib/create-matching";

// `1e` — the 03 §7.4 pre-check task, exported so the waves sweep composes the same task the P-2 caller runs.
export { autofire } from "./lib/autofire";
// `4d` — `dfy-waves` (01 §4f): the net under the pre-check, re-firing any OPEN position with no lever. A
// standalone function, the shape `admin.callDueSweep` uses, because it composes two connector calls and adds
// no state of its own.
export { sweepPrecheckWaves } from "./lib/sweep-precheck-waves";
// `2d` (kickoff debt 2) — the ONE read of `nanny_public` that answers a name, for the three surfaces 04 §7.1
// writes `{nanny}` on. Boot injects it into `connections`; none of the three may import this module.
export { publicNannyName } from "./lib/public-nanny-name";
export { stubMatching } from "./matching.stub";

// The screens' routes and the shared query keys (02.13 funnel-source contract, carried).
export { FUNNEL_PATHS } from "./lib/funnel-paths";

// Page assembly for the thin route files (05 §7 rule 5).
export { buildQuickMatchPage } from "./lib/build-quick-match-page";
export { buildPreAuthPage } from "./lib/build-pre-auth-page";
export { quickMatchSchedule } from "./lib/quick-match-schedule";

// S-X-03's question bank (shared with S-P-04) and its boundary validator.
export { WIZARD_QUESTIONS } from "./lib/wizard-questions";
export { AGE_LABELS } from "./lib/age-labels";
export type { WizardQuestion } from "./lib/wizard-questions";
export { parseWizardAnswers } from "./lib/wizard-answers-schema";

// `1e` — the one conversion from the shared answers to the position P-2 opens (both roads into the stage model).
export { positionDetailOf } from "./lib/position-detail-of";

// Server actions (01 §4e) — passed to client components as props.
export { saveParentLeadAction } from "./actions/save-parent-lead-action";
export { connectAction } from "./actions/connect-action";

// Screens + parts (S-X-02 · S-X-03 · S-X-04; the card `public-site` reuses on S-X-10).
export { FunnelShell } from "./components/FunnelShell";
export { NannyPreviewCard } from "./components/NannyPreviewCard";
export { DbsBadge } from "./components/DbsBadge";
export { AreaCombobox } from "./components/AreaCombobox";
export { QuickMatchResults } from "./components/QuickMatchResults";
export { PreAuthResults } from "./components/PreAuthResults";
export { Wizard } from "./components/Wizard";
