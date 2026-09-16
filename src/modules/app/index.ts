// app connector (01 §2.5; 00-glossary §3) — the paid product: `katie` · `child-development` · `child-linking`
// (ADR-019). The three are sub-modules with their own `index.ts`; **this** connector is what the outside imports
// (`@/modules/app`), never a deep path. May import `comms` (S) · `auth` (S) · `platform` (S), plus
// `platform/consent` for the child-linking consents (01 §2.3; 02 R-4).
export type * from "./types";

// Sub-module vocabularies (01 §2.5 — "the parent's connector re-exports what the outside may use").
export type * from "./katie";
export type * from "./child-development";
export type * from "./child-linking";

// The one runtime surface today: the child-link reads that bound a family's access (ADR-083 / 084).
export { childLinking, configureChildLinking } from "./child-linking";
export { stubApp } from "./app.stub";
