// vetting-providers connector (03 §4; swappable, T-3.1) — the mechanism behind `verification`. The
// platform verifies, it does not issue: a provider *checks* evidence a nanny supplies, never deciding a level.
// Importer: `verification` only (`admin-verification` reaches providers through `verification`).
//
// **ADR-117 Tier A — this unit shipped the connector and the types only.** No evidence is read, no storage
// path is opened and no provider is called: the submission store is a port with a fail-closed default, and
// `stub-manual` is its shell. The insides (DBS, identity documents, right to work) are built and reviewed
// inline in a later unit. See README "Held back".
export type * from "./types";

export { getProvider } from "./lib/get-provider";
export { listProviders } from "./lib/list-providers";

// The day-one binding (03 §4.4) — every `EvidenceType` maps to it through `config/vetting.ts`.
export { stubManualProvider } from "./stub-manual";

// The store port: unconfigured until the reviewed evidence unit installs it.
export { configureVettingStore } from "./lib/configure-vetting-store";
export { unconfiguredVettingStore } from "./lib/unconfigured-vetting-store";
