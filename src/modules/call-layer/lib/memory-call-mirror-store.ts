// The in-memory `CallMirrorStore` (1d) — the one the suites use. Replaced, never mutated: every `put` swaps the
// frozen map for a new one, so a reader holding an old snapshot never sees a half write.
//
// `1g`: the real store over `nanny_positions` + `position_call_mirror` (migration `0018`) lives in
// `src/boot/db-call-mirror-store.ts` and is what boot installs in every environment now. This one stays because
// the suites need a mirror with no database behind it, and because it is the one place the port's semantics are
// written out in twenty lines rather than in SQL.
import { ok } from "@/modules/platform";
import type { PositionId, UserId } from "@/modules/shared-types";
import type { CallMirror, CallMirrorStore, OpenCallSummary } from "../types";

const summaryOf = (mirror: CallMirror): OpenCallSummary =>
  Object.freeze({
    positionId: mirror.positionId,
    parentId: mirror.parentId,
    type: mirror.type,
    state: mirror.state,
    bookingId: mirror.bookingId,
    requestedAt: mirror.requestedAt,
    noAnswerCount: mirror.noAnswerCount,
    ...(mirror.aboutNanny === undefined
      ? {}
      : { aboutNanny: mirror.aboutNanny }),
  });

export function memoryCallMirrorStore(
  seed: ReadonlyArray<CallMirror> = [],
): CallMirrorStore {
  const holder = {
    current: new Map<PositionId, CallMirror>(
      seed.map((mirror) => [mirror.positionId, Object.freeze(mirror)]),
    ),
  };

  return Object.freeze({
    get: async (positionId: PositionId) =>
      ok(holder.current.get(positionId) ?? null),
    findOpenForParent: async (parentId: UserId) =>
      ok(
        [...holder.current.values()].find(
          (mirror) => mirror.parentId === parentId && mirror.state !== "done",
        ) ?? null,
      ),
    listOpen: async () =>
      ok(
        Object.freeze(
          [...holder.current.values()]
            .filter((mirror) => mirror.state !== "done")
            .map(summaryOf),
        ),
      ),
    put: async (mirror: CallMirror) => {
      holder.current = new Map([
        ...holder.current,
        [mirror.positionId, Object.freeze(mirror)],
      ]);
      return ok(undefined);
    },
  });
}
