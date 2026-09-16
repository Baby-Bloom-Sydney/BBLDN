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

// Clock + id minting (the one place a branded id is minted)
export { nowInstant } from "./lib/now-instant";
export { newId } from "./lib/new-id";

// Sub-modules (01 §2.5) — the parent connector re-exports what the outside may use
export * from "./log";
export * from "./events";
export * from "./consent";
export * from "./rate-limit";
export * from "./upload-scan";
export * from "./unit-of-work";
