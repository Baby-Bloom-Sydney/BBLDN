// comms connector (01 §2.4; ADR-069, ADR-116) — the service module every module may import for the one
// outbound seam (03 §8). It imports `config`, `shared-types` and `platform` only, and never a business module.
//
// The module-level `comms` **fails closed** until boot configures it: there is no template file and no
// `email_logs` table on `main` yet, and a seam that silently swallowed a send would be worse than one that
// says so (01 §4a rule 2). `configureComms(createComms({ … }))` in `src/instrumentation.ts` (F-c) installs it.
export type * from "./types";

// The connector (03 §8.1).
export { comms } from "./lib/default-comms";
export { configureComms } from "./lib/configure-comms";
export { createComms } from "./lib/create-comms";
export { unconfiguredComms } from "./lib/unconfigured-comms";

// The registry (03 §8.2) as a value, for the table tests of 03 §11 row 7.
export { TEMPLATE_IDS } from "./lib/template-ids";

// Provider selection by config, never by import (05 §3 rule 1).
export { emailProviderFor } from "./lib/email-provider-for";

// Sub-modules (01 §2.5) — the parent connector re-exports what the outside may use.
export * from "./email";
export * from "./sms";
