// platform connector (01 §2.4; ADR-069) — the service module every module may import: `log` (§4b), `Events`
// + `ConsentReader` (§7), `Result` helpers + `ErrorCode` → HTTP mapping (§4a), the envelope helpers (§4c / §4e),
// `withUnitOfWork` + the opaque `UnitOfWork` token (§6.3; 03 §1.4; ADR-127), `platform/consent` (02 R-4), the
// rate-limit (07 §8) and upload-scan (07 §5.3 rule 3, ADR-106) interfaces. Client-safe: nothing here reads server
// env; the boot code (`src/instrumentation.ts`, P1-WIRE) injects the real ports through the `configure*` calls.
export type * from "./types";

// Result (01 §4a)
export { ok } from "./lib/ok";
export { err } from "./lib/err";
export { fromThrown } from "./lib/from-thrown";
export { toClientError } from "./lib/to-client-error";
export { statusForCode } from "./lib/status-for-code";

// Envelope (01 §4c) — route handlers + server actions (01 §4e)
export { envelopeOf } from "./lib/envelope-of";
export { toResponse } from "./lib/to-response";
export { toActionResult } from "./lib/to-action-result";

// The boot slot every module's `configure*` seam is built on (M-10). The **type** was exported and the factory
// was not, so nineteen modules wrote the same five lines by hand — nineteen places the `set` semantics could
// drift, in the one mechanism that decides which implementation a module is bound to.
export { createRegistry } from "./lib/create-registry";

// Clock + id minting (the one place a branded id is minted)
export { nowInstant } from "./lib/now-instant";
// The London wall clock at an instant (01 §4f) — "today / yesterday in London" for every cron handler, and the
// hour the cron due-gate compares against the schedule declared in `config/crons.ts`.
export { londonWallClock } from "./lib/london-wall-clock";
export { newId } from "./lib/new-id";
// ADR-102 — the one UK-mobile rule, shared by both onboarding modules (lifted from `onboarding-parent` by `2a`).
export { normaliseUkMobile } from "./lib/normalise-uk-mobile";

// Sub-modules (01 §2.5) — the parent connector re-exports what the outside may use
export * from "./log";
export * from "./events";
export * from "./consent";
export * from "./privacy";
export * from "./rate-limit";
export * from "./upload-scan";
export * from "./unit-of-work";
