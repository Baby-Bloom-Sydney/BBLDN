// `platform/privacy`'s `onErased` seam (03 §9.3 Retention group): a completed erasure emits `account.deleted`.
// The actor is `system` and the subject is the person — the erasure is something we did, on her instruction, and
// the props carry ids and table names only (the event schema is `.strict()` and refuses PII-shaped strings).
//
// A failed emit does not fail the erasure: the rows are already gone and the transaction is already committed, so
// the honest handling is a `warn` rather than an error that implies the scrub can be retried.
import { Events } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";

export const emitAccountDeleted = async (input: {
  readonly subjectUserId: string;
  readonly scrubbedTables: ReadonlyArray<string>;
  readonly objectCount: number;
}): Promise<void> => {
  const emitted: Result<unknown> = await Events.emit({
    name: "account.deleted",
    actor: { kind: "system", id: "delete-account" },
    props: {
      userId: input.subjectUserId,
      scrubbedTables: [...input.scrubbedTables],
      objectCount: input.objectCount,
    },
  });
  if (!emitted.ok) return;
};
