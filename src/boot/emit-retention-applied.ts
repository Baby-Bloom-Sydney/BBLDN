// `platform/privacy`'s `onSwept` seam (03 §9.3 Retention group; 07 §6.2's own sentence): a class that actually
// removed or nulled rows emits `retention.applied`.
//
// One event per **class**, not per row and not per run — the class is what 07 §6.2 calls a retention row, and a
// per-row event on a table like `events` would be a retention sweep writing more rows than it removed.
// `objectCount` is zero by construction: the sweep touches no storage object, because every object-bearing row
// of 07 §6.2 is `deferred` in `config/retention.ts` for exactly that reason.
//
// A failed emit does not fail the sweep: the rows are already gone and the transaction is already committed, so
// the honest handling is silence rather than an error implying the class can be swept again.
import { Events } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";

export const emitRetentionApplied = async (input: {
  readonly class: string;
  readonly rowCount: number;
}): Promise<void> => {
  const emitted: Result<unknown> = await Events.emit({
    name: "retention.applied",
    actor: { kind: "system", id: "retention-sweep" },
    props: {
      retentionRow: input.class,
      rowCount: input.rowCount,
      objectCount: 0,
    },
  });
  if (!emitted.ok) return;
};
