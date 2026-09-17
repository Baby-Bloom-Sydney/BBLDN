// ADR-129 — the one runtime answer to "is this name a view?", read from `shared-types`' frozen tuple so the two
// drivers (`supabase-query.ts`, `memory-auth-driver.ts`) hand back the same select-only handle for the same names.
import { VIEW_NAMES } from "@/modules/shared-types";
import type { ViewName } from "@/modules/shared-types";
import type { AppDatabase } from "../types";

const NAMES: ReadonlySet<string> = new Set<string>(VIEW_NAMES);

export function isViewName(name: string): name is ViewName<AppDatabase> {
  return NAMES.has(name);
}
