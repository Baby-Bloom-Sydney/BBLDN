// The purge half of the `PrivacyStore` (07 §6.1 step 6; L-009 `3g`) — `0030`'s two functions over `auth`'s port.
//
// Same two load-bearing properties as the erasure half, for the same reasons:
//
//   1. **One RPC per subject, so it is one transaction.** `purge_scrubbed_user` checks every window and deletes,
//      or does neither. There is no shape of this store that could do it in pieces.
//   2. **A raised refusal is classified here and nowhere else.** The `for update nowait` probe losing, or a
//      `restrict` foreign key the windows did not anticipate, raises a real SQLSTATE; `port.run` would flatten it
//      to `INTERNAL` and tell the sweep that a retryable contention was permanent. The same `RETRYABLE` set the
//      erasure half uses, plus `23503` — a foreign key still holding is exactly the safety net the job wants
//      retried after whatever holds it has gone.
//
// **The windows travel from `LEGAL.erasureRetains`, never from here.** This file's one job on that front is to
// hand the list across unchanged; it does not know what six years means and must not learn.
import type { DataAccessPort } from "@/modules/auth";
import { err, ok } from "@/modules/platform";
import type {
  PrivacyErrorDetails,
  PrivacyStore,
  PurgeOutcome,
} from "@/modules/platform";
import type { Instant } from "@/modules/shared-types";

const service = { scope: "service" as const };

/**
 * SQLSTATEs a purge may legitimately lose to. `55P03` is the `nowait` probe, `40001` / `40P01` are serialisation
 * and deadlock, `23514` is a guard, and **`23503`** is a foreign key still referencing the subject — which means
 * the windows missed a table, the delete was refused by the database rather than succeeding, and the right
 * answer is to try again once whatever holds the row has gone.
 */
const RETRYABLE = new Set(["55P03", "23514", "23503", "40001", "40P01"]);

const retry = () =>
  err<PrivacyErrorDetails>(
    "CONFLICT",
    "That could not be completed just now.",
    {
      reason: "retry",
    },
  );

type RawCandidate = {
  readonly subject_user_id: string;
  readonly scrubbed_at: string;
};

type RawOutcome = {
  readonly outcome?: string;
  readonly reason?: string;
  readonly until?: string;
};

/** `0030`'s answer, narrowed to the connector's type — an unknown outcome is a failure, never a silent pass. */
function purgeOutcomeOf(raw: unknown): PurgeOutcome | null {
  const answer = (raw ?? {}) as RawOutcome;
  if (
    answer.outcome !== "purged" &&
    answer.outcome !== "already-purged" &&
    answer.outcome !== "refused"
  )
    return null;
  return Object.freeze({
    outcome: answer.outcome,
    ...(answer.reason === undefined ? {} : { reason: answer.reason }),
    ...(answer.until === undefined ? {} : { until: answer.until }),
  }) as PurgeOutcome;
}

const listPurgeCandidates =
  (port: DataAccessPort): PrivacyStore["listPurgeCandidates"] =>
  async ({ before, limit }) => {
    const listed = await port.run(
      {
        name: "platform.privacy.listPurgeCandidates",
        exec: async (q) =>
          ((await q.rpc("subjects_ready_to_purge", {
            p_before: before,
            p_limit: limit,
          })) ?? []) as ReadonlyArray<RawCandidate>,
      },
      service,
    );
    if (!listed.ok) return listed as never;
    return ok(
      listed.value.map((row) =>
        Object.freeze({
          subjectUserId: row.subject_user_id,
          scrubbedAt: row.scrubbed_at as Instant,
        }),
      ),
    );
  };

const purgeSubject =
  (port: DataAccessPort): PrivacyStore["purgeSubject"] =>
  async ({ subjectUserId, windows }) => {
    const run = await port.run(
      {
        name: "platform.privacy.purgeSubject",
        exec: async (q) => {
          try {
            return {
              kind: "answered" as const,
              value: await q.rpc("purge_scrubbed_user", {
                p_user_id: subjectUserId,
                p_windows: windows,
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
    if (run.value.kind === "retry") return retry() as never;
    const outcome = purgeOutcomeOf(run.value.value);
    if (outcome === null)
      return err<PrivacyErrorDetails>("INTERNAL", "The purge did not answer.", {
        reason: "store-failed",
      }) as never;
    return ok(outcome);
  };

export function privacyPurgeOps(
  port: DataAccessPort,
): Pick<PrivacyStore, "listPurgeCandidates" | "purgeSubject"> {
  return Object.freeze({
    listPurgeCandidates: listPurgeCandidates(port),
    purgeSubject: purgeSubject(port),
  });
}
