// The retention half of the `PrivacyStore` (07 §6.2; L-009 `3h`) — `0031`'s one function over `auth`'s port.
//
// Same two load-bearing properties as the erasure and purge halves, for the same reasons:
//
//   1. **One RPC per class, so a class is one transaction.** `retention_sweep_class` takes its batch or none of
//      it. There is no shape of this store that could do half a class, which is the point: a sweep that removed
//      the rows and failed to null the columns would be a promise half kept with nothing recording which half.
//   2. **A raised refusal is classified here and nowhere else.** The `for update nowait` probe losing, a
//      deadlock, or a foreign key the schedule did not anticipate raises a real SQLSTATE; `port.run` would
//      flatten it to `INTERNAL` and tell the sweep that a retryable contention was permanent. The same
//      `RETRYABLE` set the purge half uses, and for the same reading of `23503` — a key still holding means the
//      schedule missed a table and the answer is to try again once whatever holds the row has gone.
//
// **The spec travels from `config/retention.ts`, never from here.** This file's one job on that front is to hand
// the class's window, anchors, targets and treatment across unchanged. It does not know what six years means.
import type { DataAccessPort } from "@/modules/auth";
import { err, ok } from "@/modules/platform";
import type {
  PrivacyErrorDetails,
  PrivacyStore,
  RetentionClassOutcome,
} from "@/modules/platform";

const service = { scope: "service" as const };

/** SQLSTATEs a sweep may legitimately lose to — the purge half's set, unchanged, because the reasons are the same. */
const RETRYABLE = new Set(["55P03", "23514", "23503", "40001", "40P01"]);

type RawOutcome = {
  readonly class?: string;
  readonly removed?: number;
  readonly nulled?: number;
  readonly capped?: boolean;
};

/** `0031`'s answer, narrowed. An answer this file cannot read is a failure, never a silent zero. */
function outcomeOf(raw: unknown, name: string): RetentionClassOutcome | null {
  const answer = (raw ?? {}) as RawOutcome;
  if (
    answer.class !== name ||
    typeof answer.removed !== "number" ||
    typeof answer.nulled !== "number" ||
    typeof answer.capped !== "boolean"
  )
    return null;
  return Object.freeze({
    class: answer.class,
    removed: answer.removed,
    nulled: answer.nulled,
    capped: answer.capped,
  });
}

export function privacyRetentionOps(
  port: DataAccessPort,
): Pick<PrivacyStore, "sweepRetentionClass"> {
  return Object.freeze({
    sweepRetentionClass: async ({ class: name, spec, limit }) => {
      const run = await port.run(
        {
          name: "platform.privacy.sweepRetentionClass",
          exec: async (q) => {
            try {
              return {
                kind: "answered" as const,
                value: await q.rpc("retention_sweep_class", {
                  p_class: name,
                  // Rebuilt as plain JSON rather than cast: the payload the database receives is written
                  // down here, once, and a readonly config value is not a wire format.
                  p_spec: {
                    window: spec.window === null ? null : { ...spec.window },
                    anchors: spec.anchors.map((anchor) => ({
                      table: anchor.table,
                      column: anchor.column,
                    })),
                  },
                  p_limit: limit,
                }),
              };
            } catch (thrown) {
              const code = (thrown as { code?: string }).code ?? "";
              if (RETRYABLE.has(code)) return { kind: "retry" as const };
              throw thrown;
            }
          },
        },
        service,
      );
      if (!run.ok) return run as never;
      if (run.value.kind === "retry")
        return err<PrivacyErrorDetails>(
          "CONFLICT",
          "That class could not be swept just now.",
          { reason: "retry" },
        ) as never;
      const outcome = outcomeOf(run.value.value, name);
      if (outcome === null)
        return err<PrivacyErrorDetails>(
          "INTERNAL",
          "The retention sweep did not answer.",
          { reason: "store-failed" },
        ) as never;
      return ok(outcome);
    },
  });
}
