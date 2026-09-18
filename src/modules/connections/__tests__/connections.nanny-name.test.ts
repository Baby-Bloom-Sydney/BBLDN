// Kickoff debt 2 — **the nanny's name on the parent surfaces** (04 §7.1 `{nanny}`). `1e` left rows 4-6 of the
// rail carrying a time where the document names a person, `1g` left S-P-08's cards the same way, and `1f` left
// the admin drawer with a raw id; all three recorded the same cause — *no connector puts a person behind these
// reads*.
//
// The fix is **one** read (`matching.publicNannyName`, `nanny_public` only — 07 §5.1 rule 4 keeps contact detail
// out and the view carries none) reaching this module as a port, exactly as `nannyFacts` and `recipientOf` do:
// 01 §2.3 gives `connections` no arrow to `matching`, so boot injects it. What the module then exposes is a
// first name and nothing else.
//
// Written RED: `ConnectionSummary` had no name, `createConnections` took no port, and `ConnectionsReads` had no
// `nannyNameOf`.
import { describe, expect, it } from "vitest";
import {
  createConnections,
  memoryConnectionStore,
  connectionCardView,
} from "@/modules/connections";
import { ok } from "@/modules/platform";
import type { ConnectionRecord } from "@/modules/connections";
import type {
  ConnectionId,
  Instant,
  NannyId,
  ParentId,
  PositionId,
} from "@/modules/shared-types";

const PARENT = "11111111-1111-4111-8111-111111111111" as ParentId;
const NANNY = "22222222-2222-4222-8222-222222222222" as NannyId;
const OTHER = "33333333-3333-4333-8333-333333333333" as NannyId;
const POSITION = "44444444-4444-4444-8444-444444444444" as PositionId;
const AT = "2026-09-19T09:00:00.000Z" as Instant;

const row = (
  id: string,
  nannyId: NannyId,
  over: Partial<ConnectionRecord> = {},
): ConnectionRecord =>
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
    ...over,
  }) as ConnectionRecord;

async function seeded(rows: ReadonlyArray<ConnectionRecord>) {
  const store = memoryConnectionStore();
  for (const each of rows) await store.put(each);
  return store;
}

const NAMES: Readonly<Record<string, string>> = {
  [NANNY as string]: "Priya",
  [OTHER as string]: "Amara",
};

describe("connections — the nanny's name reaches the parent surfaces (kickoff debt 2; 04 §7.1)", () => {
  it("forParent carries her first name when the port answers", async () => {
    const store = await seeded([row("c-1", NANNY)]);
    const reads = createConnections({
      store,
      nannyNameOf: async (id) => ok(NAMES[id as string] ?? null),
    });

    const summaries = await reads.forParent(PARENT);

    expect(summaries.ok).toBe(true);
    expect(summaries.ok && summaries.value[0]?.nannyFirstName).toBe("Priya");
  });

  it("asks the port once per nanny, however many rows she holds", async () => {
    const store = await seeded([
      row("c-1", NANNY),
      row("c-2", NANNY, { stage: "NOT_HIRED" }),
      row("c-3", OTHER),
    ]);
    const asked: string[] = [];
    const reads = createConnections({
      store,
      nannyNameOf: async (id) => {
        asked.push(id as string);
        return ok(NAMES[id as string] ?? null);
      },
    });

    await reads.forParent(PARENT);

    expect(asked.length).toBe(2);
    expect(new Set(asked).size).toBe(2);
  });

  it("leaves the name off rather than inventing one when the read refuses or answers nothing", async () => {
    const store = await seeded([row("c-1", NANNY)]);
    const reads = createConnections({
      store,
      nannyNameOf: async () => ok(null),
    });

    const summaries = await reads.forParent(PARENT);

    expect(summaries.ok).toBe(true);
    expect(summaries.ok && "nannyFirstName" in (summaries.value[0] ?? {})).toBe(
      false,
    );
  });

  it("works with no port at all — the module is usable with none (the nannyFacts precedent)", async () => {
    const store = await seeded([row("c-1", NANNY)]);
    const reads = createConnections({ store });

    const summaries = await reads.forParent(PARENT);

    expect(summaries.ok).toBe(true);
    expect(summaries.ok && summaries.value.length).toBe(1);
  });

  it("nannyNameOf is on the connector, so `admin` can name a nanny it has no other road to", async () => {
    const store = await seeded([]);
    const reads = createConnections({
      store,
      nannyNameOf: async (id) => ok(NAMES[id as string] ?? null),
    });

    const name = await reads.nannyNameOf(NANNY);

    expect(name.ok && name.value).toBe("Priya");
  });

  it("S-P-08's card names her on the meeting line (04 §7.1 row 4 `{nanny}`)", () => {
    const card = connectionCardView({
      connectionId: "c-1" as ConnectionId,
      positionId: POSITION,
      nannyId: NANNY,
      stage: "INTRO_SCHEDULED",
      origin: "parent_request",
      meetingAt: AT,
      nannyFirstName: "Priya",
    });

    expect(card.nannyFirstName).toBe("Priya");
    // the stage phrase is 04 §6.2's own vocabulary and the name is not folded into it
    expect(card.state).toBe("Meeting arranged");
  });

  it("S-P-08's card still reads without a name (the read may refuse)", () => {
    const card = connectionCardView({
      connectionId: "c-1" as ConnectionId,
      positionId: POSITION,
      nannyId: NANNY,
      stage: "INTRO_SCHEDULED",
      origin: "parent_request",
      meetingAt: AT,
    });

    expect(card.state.length).toBeGreaterThan(0);
    expect("nannyFirstName" in card).toBe(false);
  });
});
