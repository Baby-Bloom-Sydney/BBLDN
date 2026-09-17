// The in-memory `ConnectionStore` — what the suites run the 25 K rows against, and the one place the port's
// semantics are written out in code rather than in SQL. Replaced, never mutated: every `put` swaps the frozen
// map for a new one, so a reader holding an old snapshot never sees a half write.
//
// The store over `connection_requests` (`0007`) is `src/boot/db-connection-store.ts`, and it is what boot
// installs.
import { ok } from "@/modules/platform";
import type {
  ConnectionId,
  ParentId,
  PositionId,
} from "@/modules/shared-types";
import type { ConnectionRecord, ConnectionStore } from "../types";

export function memoryConnectionStore(
  seed: ReadonlyArray<ConnectionRecord> = [],
): ConnectionStore {
  const holder = {
    current: new Map<ConnectionId, ConnectionRecord>(
      seed.map((row) => [row.connectionId, Object.freeze(row)]),
    ),
  };
  const all = (): ReadonlyArray<ConnectionRecord> => [
    ...holder.current.values(),
  ];

  return Object.freeze({
    get: async (connectionId: ConnectionId) =>
      ok(holder.current.get(connectionId) ?? null),
    forPosition: async (positionId: PositionId) =>
      ok(Object.freeze(all().filter((row) => row.positionId === positionId))),
    forParent: async (parentId: ParentId) =>
      ok(Object.freeze(all().filter((row) => row.parentId === parentId))),
    put: async (record: ConnectionRecord) => {
      holder.current = new Map([
        ...holder.current,
        [record.connectionId, Object.freeze(record)],
      ]);
      return ok(undefined);
    },
  });
}
