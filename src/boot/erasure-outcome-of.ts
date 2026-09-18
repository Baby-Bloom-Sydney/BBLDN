// `erase_account()`'s jsonb answer → the connector's `ErasureOutcome`. The function returns exactly these four
// keys (`0028` §6) and this is the one place that shape is read, so a change to either side is a change to one
// file. An unrecognised `outcome` reads as `refused` with no reason rather than as `erased`: the safe direction
// is to under-claim what happened, never to tell a person her account was deleted on a value we did not expect.
import type { ErasureOutcome, ErasureRefusal } from "@/modules/platform";

const REFUSALS: ReadonlyArray<ErasureRefusal> = Object.freeze([
  "live-placement",
  "live-subscription",
  "retry",
]);

export function erasureOutcomeOf(raw: unknown): ErasureOutcome {
  const value = (raw ?? {}) as Record<string, unknown>;
  const outcome =
    value.outcome === "erased"
      ? "erased"
      : value.outcome === "already-erased"
        ? "already-erased"
        : "refused";
  const reason = REFUSALS.find((r) => r === value.reason);
  return Object.freeze({
    outcome,
    ...(reason === undefined ? {} : { reason }),
    retainedClasses: (Array.isArray(value.retainedClasses)
      ? value.retainedClasses
      : []) as ErasureOutcome["retainedClasses"],
    scrubbedTables: Array.isArray(value.scrubbedTables)
      ? (value.scrubbedTables as ReadonlyArray<string>)
      : [],
    objectCount: typeof value.objectCount === "number" ? value.objectCount : 0,
  });
}
