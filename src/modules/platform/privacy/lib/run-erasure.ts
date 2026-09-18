// One Art 17 request, end to end (07 §6.1; B-46). The order is the whole of the design and it is stated in
// `0028`'s header (d): **collect → remove → one transaction**.
//
// Removing a storage object is an HTTP call, so it cannot be inside the transaction that scrubs the database. It
// therefore happens *before*, and the evidence row for each object is written *inside* — so a crash between the
// two leaves objects gone and the database intact, which is the failure in the safe direction, and the next run
// collects the same paths (the refs are still there), removes nothing (already gone) and commits. The evidence
// never claims a deletion that did not happen.
//
// An object we could not remove does not fail the erasure and does not get an evidence row: it is logged with an
// alert and the scrub proceeds, because leaving a person's database record intact for the sake of one orphaned
// object would be the wrong trade in the wrong direction. The sweep re-collects it on the next run.
import type { Result } from "@/modules/shared-types";
import type {
  ErasureObject,
  ErasureOutcome,
  PrivacyDeps,
  PrivacyErrorDetails,
} from "../types";

async function removeAll(
  objects: ReadonlyArray<ErasureObject>,
  deps: PrivacyDeps,
): Promise<ReadonlyArray<ErasureObject>> {
  const removed: ErasureObject[] = [];
  for (const object of objects) {
    const gone = await deps.store.removeObject(object);
    if (gone.ok) {
      removed.push(object);
      continue;
    }
    deps.log?.error("erasure could not remove an object", {
      alert: "ALERT_ERASURE_OBJECT_STUCK",
      action: "erase-account",
      bucket: object.bucket,
      entityKind: object.entityKind,
      reason: gone.error.details?.reason ?? gone.error.code,
    });
  }
  return removed;
}

export async function runErasure(
  input: { readonly subjectUserId: string; readonly requestId: string },
  deps: PrivacyDeps,
): Promise<Result<ErasureOutcome, PrivacyErrorDetails>> {
  const objects = await deps.store.collectObjects(input.subjectUserId);
  if (!objects.ok) return objects;

  const removed = await removeAll(objects.value, deps);

  const erased = await deps.store.runErasure({
    subjectUserId: input.subjectUserId,
    requestId: input.requestId,
    deletedObjects: removed,
  });
  if (!erased.ok) return erased;

  // `account.deleted` records the erasure, not the request — so an `already-erased` answer emits nothing. A
  // second event for the same person would make the audit trail say it happened twice.
  if (erased.value.outcome === "erased" && deps.onErased !== undefined)
    await deps.onErased({
      subjectUserId: input.subjectUserId,
      scrubbedTables: erased.value.scrubbedTables,
      objectCount: erased.value.objectCount,
    });

  return erased;
}
