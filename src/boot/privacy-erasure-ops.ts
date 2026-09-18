// The erasure half of the `PrivacyStore` (07 §6.1; B-46). Two things here are load-bearing:
//
//   1. **The scrub is one RPC, so it is one transaction** (ADR-127). `erase_account` does every database step of
//      07 §6.1 or none of them; there is no shape of this store that could do it in pieces, which is the point.
//   2. **A raised refusal is classified here and nowhere else.** `0027`'s guards and the pseudonymiser's `nowait`
//      probe raise real SQLSTATEs; `port.run` turns any throw into a flat `INTERNAL`, which would tell the sweep
//      that a retryable contention was a permanent failure. So `exec` catches and returns a discriminated value
//      instead of throwing, and the reason travels as `retry`.
//
// Objects go through the port's `removeObject`, at service scope, because `0015` refuses a direct
// `storage.objects` delete for every role and the blob is not in Postgres at all.
import type { DataAccessPort } from "@/modules/auth";
import { err, ok } from "@/modules/platform";
import type {
  ErasureObject,
  ErasureOutcome,
  PrivacyErrorDetails,
  PrivacyStore,
} from "@/modules/platform";
import type { BucketKey } from "@/modules/shared-types";
import { erasureOutcomeOf } from "./erasure-outcome-of";

const service = { scope: "service" as const };

/** SQLSTATEs an erasure may legitimately lose to, and which the sweep should try again (`0027`'s rulings). */
const RETRYABLE = new Set(["55P03", "23514", "40001", "40P01"]);

const failure = (reason: PrivacyErrorDetails["reason"], message: string) =>
  err<PrivacyErrorDetails>(
    reason === "retry" ? "CONFLICT" : "INTERNAL",
    message,
    { reason },
  );

type RawObject = {
  readonly bucket: string;
  readonly path: string;
  readonly entity_kind: string;
  readonly entity_id: string;
};

const collectObjects =
  (port: DataAccessPort): PrivacyStore["collectObjects"] =>
  async (subjectUserId) => {
    const collected = await port.run(
      {
        name: "platform.privacy.collectObjects",
        exec: async (q) =>
          (await q.rpc("collect_erasure_objects", {
            p_user_id: subjectUserId,
          })) as ReadonlyArray<RawObject>,
      },
      service,
    );
    if (!collected.ok) return collected as never;
    return ok(
      collected.value.map((row) =>
        Object.freeze({
          bucket: row.bucket,
          path: row.path,
          entityKind: row.entity_kind === "child" ? "child" : "user",
          entityId: row.entity_id,
        }),
      ) as ReadonlyArray<ErasureObject>,
    );
  };

const removeObject =
  (port: DataAccessPort): PrivacyStore["removeObject"] =>
  async (object) => {
    const removed = await port.removeObject({
      bucket: object.bucket as BucketKey,
      path: object.path,
    });
    if (!removed.ok)
      return failure(
        "store-failed",
        "The object could not be removed",
      ) as never;
    return ok(undefined);
  };

const runErasure =
  (port: DataAccessPort): PrivacyStore["runErasure"] =>
  async (input) => {
    const run = await port.run(
      {
        name: "platform.privacy.runErasure",
        exec: async (q) => {
          try {
            return {
              kind: "answered" as const,
              value: await q.rpc("erase_account", {
                p_user_id: input.subjectUserId,
                p_request_id: input.requestId,
                p_deleted_objects: input.deletedObjects.map((o) => ({
                  bucket: o.bucket,
                  path: o.path,
                  entityKind: o.entityKind,
                  entityId: o.entityId,
                })),
              }),
            };
          } catch (thrown) {
            // A safeguarding decision in flight beats an erasure (`0027`), and a guard that fires means the
            // transaction rolled back whole. Both are "try again", not "this person cannot be erased".
            const code = (thrown as { code?: string }).code ?? "";
            if (RETRYABLE.has(code)) return { kind: "retry" as const };
            throw thrown;
          }
        },
      },
      { ...service, ...(input.uow === undefined ? {} : { uow: input.uow }) },
    );
    if (!run.ok) return run as never;
    if (run.value.kind === "retry")
      return failure("retry", "That could not be completed just now.") as never;
    return ok(erasureOutcomeOf(run.value.value) as ErasureOutcome);
  };

export function privacyErasureOps(
  port: DataAccessPort,
): Pick<PrivacyStore, "collectObjects" | "removeObject" | "runErasure"> {
  return Object.freeze({
    collectObjects: collectObjects(port),
    removeObject: removeObject(port),
    runErasure: runErasure(port),
  });
}
