// 07 §6.2's schedule in the shape `0031` reads it (ADR-179; L-009 `3h`).
//
// Its own file for `purge-windows.ts`'s reason, one class wider: the sweep is behaviour, this is a **projection
// of a legal fact**. `config/retention.ts` owns the windows, the anchors and the treatments — 07 §6.2's table is
// where they came from — and this hands them across without interpreting them. Nothing here knows what six years
// means, and nothing here should learn.
//
// **It filters, and the filter is the ruling.** A class the config marks `deferred` (07 §6.2's ★ windows, which
// are BAI's to confirm) or `none` has no arm in `0031` and never reaches the store: the migration raises on an
// unknown class deliberately, so that a sweep silently doing nothing is impossible — which means the caller must
// not ask. Filtering here rather than in the loop keeps "what the sweep acts on" one sentence long.
import { RETENTION } from "@/modules/config";
import type { RetentionSpec } from "../types";

export function retentionSpecs(): ReadonlyArray<RetentionSpec> {
  return Object.freeze(
    RETENTION.schedule
      .filter(
        (row) =>
          row.treatment.kind === "delete" ||
          row.treatment.kind === "null-columns",
      )
      .map((row) =>
        Object.freeze({
          class: row.class,
          spec: Object.freeze({ window: row.window, anchors: row.anchors }),
        }),
      ),
  );
}
