// The one clock: an ISO-8601 instant (UTC, `Z` designator — 01 §4c rule 3). Injected as `clock` everywhere so
// tests pin time; only the module-level defaults call it directly.
import type { Instant } from "@/modules/shared-types";

export const nowInstant = (): Instant => new Date().toISOString() as Instant;
