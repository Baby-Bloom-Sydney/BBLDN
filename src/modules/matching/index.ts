// matching connector (01 §2.5; 03 §7.4) — quick match, advanced match, results, the pre-auth wizard and the
// `autofire` pre-check job. It is the **only** caller of `scoring` (03 §7.2), and it calls `positions`' stage-model
// connector rather than being called by it (fix: A-1 / R2). May import `positions` · `scoring` · `areas` (S) ·
// `platform` (S).
export type * from "./types";

export { matching } from "./lib/default-matching";
export { configureMatching } from "./lib/configure-matching";
export { stubMatching } from "./matching.stub";
