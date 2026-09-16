// The four service modules (01 §2.4; ADR-069): importable by every module through their connector, and
// themselves leaves — they import only `config` + `shared-types`.
import type { MODULE_NAMES } from "../../src/modules/shared-types/module-names.ts";

export const SERVICE_MODULES = Object.freeze([
  "areas",
  "auth",
  "comms",
  "platform",
] as const satisfies ReadonlyArray<(typeof MODULE_NAMES)[number]>);
