// The `connections` half of swap test 1 (03 §11): keep `index.ts` + `types.ts`, and the K-row slice the boot file
// hands to the stage model still honours the handler contract, while the reads still answer through the binding.
//
// Note what this file deliberately does **not** do: it never imports `positions`. 01 §2.3 gives `connections` no
// such arrow — that direction is the cycle R2 closed — and the boundary lint enforces it in tests as well as in
// source. So the slice is exercised through the handler contract directly, and the dispatch half of the swap is
// proved where it belongs, in `positions`' own suite.
import { beforeEach, describe, expect, it } from "vitest";
import {
  configureConnections,
  connections,
  stubConnections,
  stubConnectionsSlice,
} from "@/modules/connections";
import type {
  Actor,
  AdvanceInput,
  Instant,
  NannyId,
  ParentId,
  TransitionId,
  UnitOfWork,
} from "@/modules/shared-types";

const PARENT_ID = "parent-1" as ParentId;
const AT = "2026-01-01T00:00:00+00:00" as Instant;
const ADMIN: Actor = Object.freeze({ kind: "admin", id: "admin-1" as never });
const UOW = {} as UnitOfWork;

const inputFor = (transition: TransitionId): AdvanceInput<TransitionId> =>
  Object.freeze({
    entity: { kind: "connection" as const, id: "connection-1" as never },
    transition,
    actor: ADMIN,
    payload: Object.freeze({}),
    expectedFrom: null,
    idempotencyKey: `key-${transition}`,
  });

beforeEach(() => {
  configureConnections(stubConnections());
});

describe("the K-row slice the boot file registers", () => {
  it("hands back one handler per transition id, in order", () => {
    const slice = stubConnectionsSlice(["K-1", "K-5", "K-6"], "ACCEPTED", AT);

    expect(slice.map((handler) => handler.id)).toEqual(["K-1", "K-5", "K-6"]);
  });

  it("runs inside the unit of work it is handed, never one of its own", async () => {
    const [handler] = stubConnectionsSlice(["K-1"], "REQUEST_SENT", AT);

    const result = await handler!.run(inputFor("K-1"), UOW);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.stage).toBe("REQUEST_SENT");
  });

  it("echoes the entity it was asked to move rather than choosing one", async () => {
    const [handler] = stubConnectionsSlice(["K-5"], "ACCEPTED", AT);

    const result = await handler!.run(inputFor("K-5"), UOW);

    expect(result.ok && result.value.entity).toEqual({
      kind: "connection",
      id: "connection-1",
    });
  });

  it("emits nothing and cascades nothing — those are Phase 1f, not the stub's", async () => {
    const [handler] = stubConnectionsSlice(["K-1"], "REQUEST_SENT", AT);

    const result = await handler!.run(inputFor("K-1"), UOW);

    expect(result.ok && result.value.events).toEqual([]);
    expect(result.ok && result.value.cascaded).toEqual([]);
  });
});

describe("the read positions calls for activeConnectionWithFamily", () => {
  it("answers no live nannies for an unseeded parent", async () => {
    const result = await connections.liveNannyIdsForParent(PARENT_ID);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual([]);
  });

  it("answers the seeded live nannies through the module binding", async () => {
    configureConnections(
      stubConnections({
        liveByParent: { [PARENT_ID]: ["nanny-1" as NannyId] },
      }),
    );

    const result = await connections.liveNannyIdsForParent(PARENT_ID);

    expect(result.ok && result.value).toEqual(["nanny-1"]);
  });

  it("counts live connections per position for the P-3 / P-4 cascades", async () => {
    configureConnections(
      stubConnections({ liveCountByPosition: { "position-1": 2 } }),
    );

    const result = await connections.liveCountForPosition(
      "position-1" as never,
    );

    expect(result.ok && result.value).toBe(2);
  });
});
