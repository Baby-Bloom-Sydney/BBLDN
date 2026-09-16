// verification connector (03 §4.3; ADR-026, ADR-071) — nanny verification behind the `vetting-providers`
// connectors. It decides levels and statuses; the providers extract and check.
//
// **ADR-117 Tier A — connector and types only in this unit.** No evidence handling, no storage path, no
// provider call: the binding fails closed until the later, inline-reviewed unit calls
// `configureVerification`. See README "Held back".
export type * from "./types";

export { verification } from "./lib/default-verification";
export { configureVerification } from "./lib/configure-verification";
export { unconfiguredVerification } from "./lib/unconfigured-verification";
