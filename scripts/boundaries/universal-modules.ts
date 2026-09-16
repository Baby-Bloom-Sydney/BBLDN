// The two universal modules (01 §2.2 "a module may additionally import `config` and `shared-types`"), in
// dependency order: a universal may import only the universals **after** it, which is what keeps the pair
// itself acyclic — `config` reads `shared-types`, and `shared-types` (01 §2.3 row 2: types only) reads nothing.
import type { MODULE_NAMES } from "../../src/modules/shared-types/module-names.ts";

export const UNIVERSAL_MODULES = Object.freeze([
  "config",
  "shared-types",
] as const satisfies ReadonlyArray<(typeof MODULE_NAMES)[number]>);
