// ★ ADR-158 (2)'s **other half**, found by this unit's `security-reviewer` pass and closed here.
//
// `0024` is the first migration that can write `held_for_verification = true`, so the read side had never been
// exercised. `0016`'s parent SELECT policy does hide a held row — `int.rpc-0024` proves it — but it only fires
// for a query run **as the parent**, and `dbConnectionStore` reads at `{ scope: "service" }` by design (`0007`
// gives `connection_requests` no client write policy and the cascades run as `system`, with no session to read
// under). So the policy is a second gate, not the gate: **the application is what must hide a held row**, and
// before this file nothing did — `connections.forParent` returned it and both parent surfaces rendered it, with
// `2d`'s own new name lookup attaching the nanny's first name to the line.
//
// The rule, in one place (`visibleToParent`): a held connection is not a parent's to see, at any stage, until the
// L4 sync releases it. The **machinery** must still see it — P-7's close cascade closes held connections too, and
// K-1's duplicate and pending-cap checks count them — so the filter is at the two parent-facing consumption
// points and nowhere else, and this suite holds both halves of that.
//
// Written RED: `ConnectionSummary` carried no held flag, `visibleToParent` did not exist, and a held row reached
// both screens with her name on it.
import { describe, expect, it } from "vitest";
import { ok } from "@/modules/platform";
import {
  createConnections,
  memoryConnectionStore,
  visibleToParent,
} from "@/modules/connections";
import type {
  ConnectionRecord,
  ConnectionSummary,
} from "@/modules/connections";
import type {
  ConnectionId,
  Instant,
  NannyId,
  ParentId,
  PositionId,
} from "@/modules/shared-types";

const PARENT = "11111111-1111-4111-8111-111111111111" as ParentId;
const HELD_NANNY = "22222222-2222-4222-8222-222222222222" as NannyId;
const OPEN_NANNY = "33333333-3333-4333-8333-333333333333" as NannyId;
const POSITION = "44444444-4444-4444-8444-444444444444" as PositionId;
const AT = "2026-09-19T09:00:00.000Z" as Instant;

const NAMES: Readonly<Record<string, string>> = {
  [HELD_NANNY as string]: "Priya",
  [OPEN_NANNY as string]: "Amara",
};

const row = (id: string, nannyId: NannyId, held: boolean): ConnectionRecord =>
  Object.freeze({
    connectionId: id as ConnectionId,
    positionId: POSITION,
    parentId: PARENT,
    nannyId,
    stage: "INTRO_SCHEDULED",
    origin: "parent_request",
    createdAt: AT,
    version: 1,
    meetingAt: AT,
    heldForVerification: held,
    ...(held ? { heldAt: AT } : {}),
  }) as ConnectionRecord;

async function world() {
  const store = memoryConnectionStore();
  await store.put(row("c-held", HELD_NANNY, true));
  await store.put(row("c-open", OPEN_NANNY, false));
  const asked: string[] = [];
  const reads = createConnections({
    store,
    nannyNameOf: async (id) => {
      asked.push(id as string);
      return ok(NAMES[id as string] ?? null);
    },
  });
  return { reads, asked };
}

describe("★ a held connection is not a parent's to see (ADR-158 (2); security-reviewer CRITICAL)", () => {
  it("forParent still answers every row — the machinery needs them (P-7, the duplicate and cap checks)", async () => {
    const { reads } = await world();

    const rows = await reads.forParent(PARENT);

    expect(rows.ok && rows.value.length).toBe(2);
    expect(
      rows.ok && rows.value.map((r) => r.heldForVerification).sort(),
    ).toEqual([false, true]);
  });

  it("★ the held row's nanny is never even looked up — no name is read for someone we may not name", async () => {
    const { reads, asked } = await world();

    await reads.forParent(PARENT);

    expect(asked).toEqual([OPEN_NANNY as string]);
    expect(asked).not.toContain(HELD_NANNY as string);
  });

  it("★ visibleToParent drops the held row and keeps the rest", async () => {
    const { reads } = await world();
    const rows = await reads.forParent(PARENT);

    const shown = visibleToParent(
      rows.ok ? rows.value : ([] as ReadonlyArray<ConnectionSummary>),
    );

    expect(shown.map((r) => r.connectionId)).toEqual(["c-open"]);
  });

  it("a summary with no held flag at all is shown — absent is not held", () => {
    const summary = {
      connectionId: "c-1" as ConnectionId,
      positionId: POSITION,
      nannyId: OPEN_NANNY,
      stage: "ACCEPTED",
      origin: "parent_request",
    } as ConnectionSummary;

    expect(visibleToParent([summary])).toHaveLength(1);
  });

  it("the rule is stage-blind: a held row is hidden at every stage, terminal ones included", async () => {
    const store = memoryConnectionStore();
    const stages = [
      "REQUEST_SENT",
      "ACCEPTED",
      "INTRO_SCHEDULED",
      "CONFIRMED",
      "ACTIVE",
      "NOT_HIRED",
    ] as const;
    for (const [index, stage] of stages.entries())
      await store.put({
        ...row(`c-${String(index)}`, HELD_NANNY, true),
        stage,
      } as ConnectionRecord);
    const reads = createConnections({ store });

    const rows = await reads.forParent(PARENT);

    expect(visibleToParent(rows.ok ? rows.value : [])).toHaveLength(0);
  });
});

/**
 * The two parent-facing consumers, end to end, and the one machinery consumer that must NOT filter.
 *
 * `loadParentConnections` is exercised through its own module boundary elsewhere; here the claim is the shape
 * that matters — the card list is built from `visibleToParent`'s output, so a held row cannot reach a card, and
 * the rail's rows 4-6 are built from the same filtered list, so a held meeting cannot reach the rail. P-7's close
 * cascade reads the **unfiltered** list, which is asserted in `positions.inside.test.ts` by the close it still
 * performs.
 */
describe("the rail and S-P-08 are built from the filtered list (ADR-158 (2))", () => {
  it("a held meeting never reaches rows 4-6", async () => {
    const { reads } = await world();
    const rows = await reads.forParent(PARENT);
    const shown = visibleToParent(rows.ok ? rows.value : []);

    // both rows are `INTRO_SCHEDULED` with the same `meetingAt`; only the unheld one survives
    expect(shown).toHaveLength(1);
    expect(shown[0]?.nannyId).toBe(OPEN_NANNY);
    expect(shown[0]?.nannyFirstName).toBe("Amara");
  });

  it("a held row carries no name even before the filter runs", async () => {
    const { reads } = await world();

    const rows = await reads.forParent(PARENT);
    const held = rows.ok
      ? rows.value.find((r) => r.heldForVerification === true)
      : undefined;

    expect(held).toBeDefined();
    expect(held?.nannyFirstName).toBeUndefined();
  });
});
