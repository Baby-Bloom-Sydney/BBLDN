// vetting-providers connector (03 §4; swappable, T-3.1) — the mechanism behind `verification`. The platform
// verifies, it does not issue: a provider *checks* evidence a nanny supplies, never deciding a level. Importer:
// `verification` only (`admin-verification` reaches providers through `verification`).
//
// Day one (03 §4.4; kickoff §4.4; ADR-154) every `EvidenceType` is bound to `stub-manual` through `config`, whose
// only outcome is `needs-admin`: the admin drives every decision from the queue (`2c`). The ledger port is
// installed by boot over `0022`'s definers and fails closed until then.
export type * from "./types";

export { getProvider } from "./lib/get-provider";
export { listProviders } from "./lib/list-providers";

// The day-one binding (03 §4.4) — every `EvidenceType` maps to it through `config/vetting.ts`.
export { stubManualProvider } from "./stub-manual";

// The ledger port: boot installs the adapter; the memory double is the test world `verification` shares.
export { configureVettingStore } from "./lib/configure-vetting-store";
export { unconfiguredVettingStore } from "./lib/unconfigured-vetting-store";
export { memoryVettingStore } from "./lib/memory-vetting-store";

// The two ledger reads the wizard's processing step and the queue share (03 §4.3).
export { listSubmissions } from "./lib/list-submissions";
export { readSubmission } from "./lib/read-submission";
export { sectionOfEvidenceType } from "./lib/section-of-evidence-type";
