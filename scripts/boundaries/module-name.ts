// The 26 day-one module names as a type (00 §3; `src/modules/shared-types/module-names.ts` is the list).
// Named once here so the generator's helpers take a `ModuleName` rather than a `string` each of them has to
// cast back (typescript-reviewer, S6 review: four independent unchecked casts, each safe only because its
// call site happened to guard).
import type { MODULE_NAMES } from "../../src/modules/shared-types/module-names.ts";

export type ModuleName = (typeof MODULE_NAMES)[number];
