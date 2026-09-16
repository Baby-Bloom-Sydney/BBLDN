// The allowed-imports table of `01-architecture.md` §2.3, machine-readable.
//
// §2.3 is the authority; this is its only copy, and `__tests__/parse-architecture-table.test.ts` parses the
// document and fails if the two disagree. The copy exists because the foundations live in the sibling `LDN/`
// tree (ADR-107 "linked") and are therefore **not** in the CI checkout — a generator that parsed the markdown
// could not run in the `allowed-imports` job at all.
//
// Each row is the §2.3 "May import (connectors only)" cell verbatim, service modules included where the row
// names them. The service modules are allowed for every row regardless (01 §2.4) — that union is applied by
// `lib/allowed-specifiers.ts`, not baked in here, so this file stays a faithful copy of the document.
import type { ModuleName } from "./module-name.ts";

export const ALLOWED_IMPORTS: Readonly<
  Record<ModuleName, readonly ModuleName[]>
> = Object.freeze({
  config: Object.freeze([] as const),
  "shared-types": Object.freeze([] as const),
  "public-site": Object.freeze([
    "matching",
    "connections",
    "areas",
    "auth",
    "comms",
  ] as const),
  areas: Object.freeze([] as const),
  matching: Object.freeze([
    "positions",
    "scoring",
    "areas",
    "platform",
  ] as const),
  scoring: Object.freeze(["areas"] as const),
  positions: Object.freeze([
    "connections",
    "placements",
    "comms",
    "areas",
    "auth",
    "platform",
  ] as const),
  "call-layer": Object.freeze([
    "positions",
    "scheduling",
    "comms",
    "auth",
    "platform",
  ] as const),
  connections: Object.freeze([
    "placements",
    "comms",
    "auth",
    "platform",
  ] as const),
  placements: Object.freeze([
    "hire-docs",
    "payments",
    "comms",
    "auth",
    "platform",
  ] as const),
  "hire-docs": Object.freeze([] as const),
  "admin-on-behalf": Object.freeze([
    "connections",
    "placements",
    "positions",
    "call-layer",
    "matching",
    "app",
    "scheduling",
    "auth",
    "platform",
  ] as const),
  scheduling: Object.freeze(["platform", "auth"] as const),
  auth: Object.freeze([] as const),
  "onboarding-parent": Object.freeze([
    "call-layer",
    "positions",
    "matching",
    "comms",
    "auth",
    "areas",
    "platform",
  ] as const),
  "onboarding-nanny": Object.freeze([
    "verification",
    "call-layer",
    "comms",
    "auth",
    "areas",
    "platform",
  ] as const),
  verification: Object.freeze([
    "vetting-providers",
    "comms",
    "auth",
    "areas",
    "platform",
  ] as const),
  "vetting-providers": Object.freeze([] as const),
  "admin-verification": Object.freeze([
    "verification",
    "comms",
    "auth",
    "platform",
  ] as const),
  comms: Object.freeze([] as const),
  platform: Object.freeze([] as const),
  payments: Object.freeze([
    "purchase-paths",
    "comms",
    "auth",
    "platform",
  ] as const),
  "purchase-paths": Object.freeze([] as const),
  "access-gate": Object.freeze([
    "payments",
    "app",
    "auth",
    "platform",
  ] as const),
  app: Object.freeze(["comms", "auth", "platform"] as const),
  admin: Object.freeze([
    "admin-on-behalf",
    "admin-verification",
    "call-layer",
    "positions",
    "connections",
    "placements",
    "payments",
    "app",
    "scheduling",
    "auth",
    "comms",
    "platform",
  ] as const),
});
