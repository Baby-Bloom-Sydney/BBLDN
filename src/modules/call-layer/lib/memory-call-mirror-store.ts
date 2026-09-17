// The in-memory `CallMirrorStore` (1d) — the one the tests and the pre-schema boot use. Replaced, never mutated:
// every `put` swaps the frozen map for a new one, so a reader holding an old snapshot never sees a half write.
// The implementation over `nanny_positions` (0006's four call columns) arrives with the RPC opener (P1-WIRE,
// ADR-127) and `positions`' inside (1e) — recorded in the `1d` PROGRESS entry.
import { ok } from "@/modules/platform";
import type { PositionId, UserId } from "@/modules/shared-types";
import type { CallMirror, CallMirrorStore } from "../types";

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
    put: async (mirror: CallMirror) => {
      holder.current = new Map([
        ...holder.current,
        [mirror.positionId, Object.freeze(mirror)],
      ]);
      return ok(undefined);
    },
  });
}
