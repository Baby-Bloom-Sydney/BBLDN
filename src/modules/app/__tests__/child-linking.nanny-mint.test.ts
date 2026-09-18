// S-N-01 (`2g`) — 04 §4.4 c1: a nanny adds a family she already works for and mints the token she passes to
// them. This is the pin `1i` recorded and the kickoff carries as debt 8, flipped **by behaviour** rather than
// by relaxing an assertion: `0019` landed `children.created_by_user_id` (trigger-stamped), the fourth arm of
// `user_has_child_access()` and `create_child_invite()`'s own `created_by_user_id = v_actor` branch, so the
// database has authorised this path since 2026-09-18. What refused it was this module — `ChildFacts` carried
// no creator, so `mayMint`'s `nanny_to_parent` arm could only see a *linked* nanny, and `createChild` refused
// a nanny outright.
//
// The three claims below are what make the surface real, and each is the module half of a rule SQL already
// holds:
//   1. a nanny creates an **unclaimed** child (`parent_user_id` null) stamped with herself as the creator;
//   2. she may mint `nanny_to_parent` for it, as its creator, with no link row in existence yet;
//   3. a nanny who is neither its creator nor linked to it may not — the same refusal `create_child_invite`
//      raises as `INVITE_NOT_YOURS`.
//
// Neither the trial nor the access window moves on a nanny-created child: there is no family to move them for
// (ADR-093 ties the trial to a family's first child, ADR-083 / 084 tie the window to a family's youngest).
import { describe, expect, it } from "vitest";
import {
  createChildLinking,
  inviteAuthorisation,
  memoryChildLinkingStore,
} from "@/modules/app";
import type {
  Actor,
  ChildId,
  ISODate,
  Instant,
  UserId,
} from "@/modules/shared-types";

const NANNY = "22222222-2222-4222-8222-222222222222" as UserId;
const OTHER_NANNY = "44444444-4444-4444-8444-444444444444" as UserId;
const PARENT = "11111111-1111-4111-8111-111111111111" as UserId;
const NOW = "2026-09-18T09:00:00.000Z" as Instant;

const nanny: Actor = { kind: "user", id: NANNY, role: "nanny" };
const otherNanny: Actor = { kind: "user", id: OTHER_NANNY, role: "nanny" };
const parent: Actor = { kind: "user", id: PARENT, role: "parent" };

const build = () => {
  const calls: string[] = [];
  const store = memoryChildLinkingStore();
  const inside = createChildLinking({
    store,
    events: { emit: async () => ({ ok: true, value: undefined }) } as never,
    now: () => NOW,
    inviteBaseUrl: "https://example.test/invite",
    setAccessWindow: async () => {
      calls.push("window");
      return { ok: true as const, value: null };
    },
    startTrial: async () => {
      calls.push("trial");
      return { ok: true as const, value: { trialEndsAt: NOW } };
    },
  } as never);
  return { inside, store, calls };
};

const addChild = (inside: ReturnType<typeof build>["inside"], actor: Actor) =>
  inside.createChild(
    { firstName: "Amara", dateOfBirth: "2025-01-15" as ISODate },
    actor,
  );

describe("S-N-01 — a nanny adds an existing family's child (04 §4.4 c1)", () => {
  it("creates the child unclaimed, stamped with the nanny as its creator", async () => {
    const { inside, store } = build();

    const made = await addChild(inside, nanny);

    expect(made.ok).toBe(true);
    const row = store.state.children[0];
    expect(row?.parent_user_id).toBeNull();
    expect(row?.created_by_user_id).toBe(NANNY);
  });

  it("moves neither the trial nor the access window — there is no family yet", async () => {
    const { inside, calls } = build();

    await addChild(inside, nanny);

    expect(calls).toEqual([]);
  });

  it("lets her mint the `nanny_to_parent` token for the child she created, with no link row", async () => {
    const { inside, store } = build();
    const made = await addChild(inside, nanny);
    if (!made.ok) throw new Error("the child was not created");
    expect(store.state.links).toEqual([]);

    const invite = await inside.createInvite(
      made.value.id,
      "nanny_to_parent",
      nanny,
    );

    expect(invite.ok).toBe(true);
    if (invite.ok) {
      expect(invite.value.direction).toBe("nanny_to_parent");
      expect(invite.value.url).toContain(invite.value.token);
    }
  });

  it("refuses a nanny who is neither the creator nor linked (the definer's INVITE_NOT_YOURS)", async () => {
    const { inside } = build();
    const made = await addChild(inside, nanny);
    if (!made.ok) throw new Error("the child was not created");

    const refused = await inside.createInvite(
      made.value.id,
      "nanny_to_parent",
      otherNanny,
    );

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );
  });

  it("is idempotent: asking twice hands back the same token (no rotation)", async () => {
    const { inside } = build();
    const made = await addChild(inside, nanny);
    if (!made.ok) throw new Error("the child was not created");

    const first = await inside.createInvite(
      made.value.id,
      "nanny_to_parent",
      nanny,
    );
    const second = await inside.createInvite(
      made.value.id,
      "nanny_to_parent",
      nanny,
    );

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok)
      expect(second.value.token).toBe(first.value.token);
  });

  it("leaves the parent's own path exactly as it was — her child is hers and the window moves", async () => {
    const { inside, store, calls } = build();

    const made = await addChild(inside, parent);

    expect(made.ok).toBe(true);
    expect(store.state.children[0]?.parent_user_id).toBe(PARENT);
    expect(calls).toContain("window");
  });
});

describe("inviteAuthorisation.mayMint — the creator arm (02 §4.6 / 0019)", () => {
  it("accepts the creator of an unclaimed child", () => {
    expect(
      inviteAuthorisation.mayMint(nanny, "nanny_to_parent", {
        parentUserId: null,
        createdByUserId: NANNY,
        linkedNannyUserIds: [],
      }),
    ).toBe(true);
  });

  it("still accepts a linked nanny who did not create it", () => {
    expect(
      inviteAuthorisation.mayMint(nanny, "nanny_to_parent", {
        parentUserId: null,
        createdByUserId: OTHER_NANNY,
        linkedNannyUserIds: [NANNY],
      }),
    ).toBe(true);
  });

  it("refuses the creator once a family has claimed the child — there is nobody left to invite", () => {
    expect(
      inviteAuthorisation.mayMint(nanny, "nanny_to_parent", {
        parentUserId: PARENT,
        createdByUserId: NANNY,
        linkedNannyUserIds: [],
      }),
    ).toBe(false);
  });

  it("refuses a parent_to_nanny mint from the creator — that is the family's to make", () => {
    expect(
      inviteAuthorisation.mayMint(nanny, "parent_to_nanny", {
        parentUserId: null,
        createdByUserId: NANNY,
        linkedNannyUserIds: [],
      }),
    ).toBe(false);
  });

  it("refuses an unknown nanny", () => {
    expect(
      inviteAuthorisation.mayMint(otherNanny, "nanny_to_parent", {
        parentUserId: null,
        createdByUserId: NANNY,
        linkedNannyUserIds: [],
      }),
    ).toBe(false);
  });
});

describe("the child a nanny created is not a road into somebody else's family", () => {
  it("she cannot mint for a child she neither created nor is linked to, even unclaimed", async () => {
    const { inside, store } = build();
    const made = await addChild(inside, nanny);
    if (!made.ok) throw new Error("the child was not created");
    // The family claims the child: the creator arm closes (0019's `parent_user_id is null` clause).
    const row = store.state.children[0];
    if (row === undefined) throw new Error("no child row");
    store.state.children = [{ ...row, parent_user_id: PARENT as string }];

    const refused = await inside.createInvite(
      made.value.id as ChildId,
      "nanny_to_parent",
      nanny,
    );

    expect(refused.ok).toBe(false);
  });
});
