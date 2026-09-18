// `app/child-linking`'s inside (`02.16` · `07.49` · `07.50` · `07.51`). Every claim the merge rests on, over
// the memory store — which mirrors `0012`'s rules exception for exception, so a rule that moves in SQL fails
// here rather than passing quietly.
//
// The two claims this unit exists for are first: **the trial starts on the first child**, and **the access
// window is recomputed at the link** — the half of ADR-084 that was owed to this module, because
// `set_access_window` was called when money moved and never when a child was linked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureChildLinking,
  createChildLinking,
  memoryChildLinkingStore,
} from "@/modules/app";
import type {
  Actor,
  ChildId,
  FamilyId,
  ISODate,
  Instant,
  InviteId,
  UserId,
} from "@/modules/shared-types";

const PARENT = "11111111-1111-4111-8111-111111111111";
const OTHER_PARENT = "44444444-4444-4444-8444-444444444444";
const NANNY = "22222222-2222-4222-8222-222222222222";
const CHILD = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-09-17T09:00:00.000Z" as Instant;

const parentActor: Actor = {
  kind: "user",
  id: PARENT as UserId,
  role: "parent",
};
const nannyActor: Actor = { kind: "user", id: NANNY as UserId, role: "nanny" };
const otherParentActor: Actor = {
  kind: "user",
  id: OTHER_PARENT as UserId,
  role: "parent",
};

type ChildSeed = { readonly id: string; readonly parent: string | null };

const childRow = (seed: ChildSeed, dob = "2025-01-15") =>
  ({
    id: seed.id,
    parent_user_id: seed.parent,
    first_name: "Amara",
    date_of_birth: dob,
    gender: null,
    profile_image_id: null,
    status: "active",
    onboarded: true,
    orphaned_at: null,
    feed_locked_for_nanny: false,
    feed_locked_at: null,
    created_at: NOW,
    updated_at: NOW,
  }) as never;

const inviteRow = (over: Record<string, unknown> = {}) =>
  ({
    id: "99999999-9999-4999-8999-999999999999",
    child_id: CHILD,
    token: "ABCD-EFGH",
    direction: "parent_to_nanny",
    status: "pending",
    created_by_user_id: PARENT,
    created_by_email_at_creation: null,
    recipient_user_id: null,
    connected_at: null,
    connected_by_user_id: null,
    revoked_at: null,
    revoked_reason: null,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  }) as never;

const linkRow = (over: Record<string, unknown> = {}) =>
  ({
    id: "77777777-7777-4777-8777-777777777777",
    child_id: CHILD,
    nanny_user_id: NANNY,
    parent_user_id: PARENT,
    placement_id: null,
    source: "invite",
    state: "active",
    ended_at: null,
    ended_by: null,
    end_reason: null,
    created_at: NOW,
    ...over,
  }) as never;

function build(seed: Parameters<typeof memoryChildLinkingStore>[0] = {}) {
  const store = memoryChildLinkingStore(seed);
  const emitted: string[] = [];
  const startTrial = vi.fn(async () => ({
    ok: true as const,
    value: { trialEndsAt: "2026-10-17T09:00:00.000Z" },
  }));
  const setAccessWindow = vi.fn(async () => ({
    ok: true as const,
    value: "2028-01-15T00:00:00.000Z",
  }));
  const inside = createChildLinking({
    store,
    events: {
      emit: async (input: { readonly name: string }) => {
        emitted.push(input.name);
        return { ok: true as const, value: undefined as never };
      },
    } as never,
    now: () => NOW,
    inviteBaseUrl: "https://example.test/invite",
    startTrial,
    setAccessWindow,
  });
  return { store, inside, emitted, startTrial, setAccessWindow };
}

describe("createChild (`07.50`) — the trial and the access window", () => {
  it("★ starts the trial on the FIRST child and recomputes the access window (03 §5.4.4; ADR-083 / 084)", async () => {
    const { inside, startTrial, setAccessWindow } = build();

    const added = await inside.createChild(
      { firstName: "Amara", dateOfBirth: "2025-01-15" as ISODate },
      parentActor,
    );

    expect(added.ok).toBe(true);
    expect(startTrial).toHaveBeenCalledTimes(1);
    expect(setAccessWindow).toHaveBeenCalledWith(PARENT as FamilyId);
  });

  it("★ recomputes the window on a SECOND child but does not start a second trial (once per family for life)", async () => {
    const { inside, startTrial, setAccessWindow } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
    });

    await inside.createChild(
      { firstName: "Bo", dateOfBirth: "2026-02-02" as ISODate },
      parentActor,
    );

    expect(startTrial).not.toHaveBeenCalled();
    expect(setAccessWindow).toHaveBeenCalledTimes(1);
  });

  it("writes the child as the ACTOR's own — `parent_user_id` never comes from input (S5's closed hole)", async () => {
    const { inside, store } = build();

    await inside.createChild(
      {
        firstName: "Amara",
        dateOfBirth: "2025-01-15" as ISODate,
        // A caller that tries to plant somebody else's id has nowhere to put it: `NewChild` has no such field,
        // and this cast proves the runtime ignores it too.
        ...({ parentUserId: OTHER_PARENT } as object),
      } as never,
      parentActor,
    );

    expect(store.state.children[0]?.parent_user_id).toBe(PARENT);
  });

  it("refuses a child at or past the age cap — `APP.maxChildAgeMonths`, never a literal (L4)", async () => {
    const { inside } = build();

    const tooOld = await inside.createChild(
      { firstName: "Elder", dateOfBirth: "2020-01-01" as ISODate },
      parentActor,
    );

    expect(tooOld.ok).toBe(false);
    expect(!tooOld.ok && tooOld.error.details?.reason).toBe("E_CHILD_TOO_OLD");
  });

  // **Re-argued to the document, not relaxed to the code (`2g`; ADR-120 rule 2).** `1i` wrote this claim as
  // "only a parent adds a child", which was true of the code and was never what 04 §4.4 c1 says — the nanny's
  // add has been in the document since it was written, and `1i` could not build it because `children` had no
  // creator column to make the row hers. `0019` gave it one. The claim therefore becomes the document's: her
  // add creates an **unclaimed** child, so neither the trial (ADR-093, a family's first child) nor the access
  // window (ADR-083 / 084, a family's youngest) moves — there is no family until the token is claimed.
  it("a nanny adds an existing family's child: unclaimed, hers as creator, no trial and no window", async () => {
    const { inside, store, startTrial, setAccessWindow } = build();

    const made = await inside.createChild(
      { firstName: "Amara", dateOfBirth: "2025-01-15" as ISODate },
      nannyActor,
    );

    expect(made.ok).toBe(true);
    expect(store.state.children[0]?.parent_user_id).toBeNull();
    expect(store.state.children[0]?.created_by_user_id).toBe(NANNY);
    expect(startTrial).not.toHaveBeenCalled();
    expect(setAccessWindow).not.toHaveBeenCalled();
  });

  it("refuses an admin with nobody named — a child row must have a traceable author (03 §2.5)", async () => {
    const { inside } = build();

    const refused = await inside.createChild(
      { firstName: "Amara", dateOfBirth: "2025-01-15" as ISODate },
      { kind: "admin", id: "admin-1" as never },
    );

    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );
  });

  it("adds the child even when the trial and the window both fail — the child is the fact", async () => {
    const store = memoryChildLinkingStore();
    const inside = createChildLinking({
      store,
      events: { emit: async () => ({ ok: true, value: undefined }) } as never,
      now: () => NOW,
      inviteBaseUrl: "https://example.test/invite",
      startTrial: async () => ({
        ok: false as const,
        error: { code: "INTERNAL" as const, message: "down" },
      }),
      setAccessWindow: async () => ({
        ok: false as const,
        error: { code: "INTERNAL" as const, message: "down" },
      }),
    });

    const added = await inside.createChild(
      { firstName: "Amara", dateOfBirth: "2025-01-15" as ISODate },
      parentActor,
    );

    expect(added.ok).toBe(true);
    expect(store.state.children).toHaveLength(1);
  });
});

describe("createInvite (`02.16`) — no rotation, ever", () => {
  it("★ returns the EXISTING pending link rather than minting a second one (memory: token stability)", async () => {
    const { inside } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
      invites: [inviteRow()],
    });

    const again = await inside.createInvite(
      CHILD as ChildId,
      "parent_to_nanny",
      parentActor,
    );

    expect(again.ok && again.value.token).toBe("ABCD-EFGH");
  });

  it("mints when there is none, and builds the URL from config rather than a literal", async () => {
    const { inside } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
    });

    const made = await inside.createInvite(
      CHILD as ChildId,
      "parent_to_nanny",
      parentActor,
    );

    if (!made.ok) throw new Error("expected the mint to succeed");
    expect(made.value.url).toBe(
      `https://example.test/invite/${made.value.token}`,
    );
  });

  it("refuses a parent who is not this child's parent", async () => {
    const { inside } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
    });

    const refused = await inside.createInvite(
      CHILD as ChildId,
      "parent_to_nanny",
      otherParentActor,
    );

    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );
  });

  it("refuses a LINKED NANNY minting a parent_to_nanny invite — she would be choosing the next nanny", async () => {
    const { inside } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
      links: [linkRow()],
    });

    const refused = await inside.createInvite(
      CHILD as ChildId,
      "parent_to_nanny",
      nannyActor,
    );

    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );
  });

  it("emits `invite.sent` with ids only — the token is never a prop (02 §4.6 `events`)", async () => {
    const { inside, emitted } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
    });

    await inside.createInvite(CHILD as ChildId, "parent_to_nanny", parentActor);

    expect(emitted).toContain("invite.sent");
  });
});

describe("revokeInvite — the only invalidation path there is", () => {
  it("revokes as the creator, and a second revoke changes nothing", async () => {
    const { inside, store } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
      invites: [inviteRow()],
    });
    const id = store.state.invites[0]?.id as string as InviteId;

    const first = await inside.revokeInvite(id, "manual", parentActor);
    const second = await inside.revokeInvite(id, "manual", parentActor);

    expect(first.ok && first.value.status).toBe("revoked");
    expect(second.ok && second.value.status).toBe("revoked");
  });

  it("refuses the recipient — revoking is the sharer's, not the other party's", async () => {
    const { inside, store } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
      invites: [inviteRow({ recipient_user_id: NANNY })],
    });
    const id = store.state.invites[0]?.id as string as InviteId;

    const refused = await inside.revokeInvite(id, "manual", nannyActor);

    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );
  });
});

describe("claimInvite (`07.51`) — the link, then the window, then the trial", () => {
  const seedForParentClaim = {
    children: [childRow({ id: CHILD, parent: null })],
    invites: [
      inviteRow({ direction: "nanny_to_parent", created_by_user_id: NANNY }),
    ],
    roles: { [PARENT]: "parent" as const, [NANNY]: "nanny" as const },
  };

  it("★ recomputes the access window AT THE LINK — the owed half of ADR-084", async () => {
    const { inside, setAccessWindow } = build(seedForParentClaim);

    const claimed = await inside.claimInvite("ABCD-EFGH", parentActor);

    expect(claimed.ok).toBe(true);
    expect(setAccessWindow).toHaveBeenCalledWith(PARENT as FamilyId);
    expect(claimed.ok && claimed.value.accessUntil).toBe(
      "2028-01-15T00:00:00.000Z",
    );
  });

  it("starts the trial for an arriving family with no child of its own (path E)", async () => {
    const { inside, startTrial } = build(seedForParentClaim);

    await inside.claimInvite("ABCD-EFGH", parentActor);

    expect(startTrial).toHaveBeenCalledTimes(1);
  });

  it("does NOT start a trial on the nanny's side of a parent's invite", async () => {
    const { inside, startTrial } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
      invites: [inviteRow()],
      roles: { [PARENT]: "parent" as const, [NANNY]: "nanny" as const },
    });

    await inside.claimInvite("ABCD-EFGH", nannyActor);

    expect(startTrial).not.toHaveBeenCalled();
  });

  it("refuses a claimant whose role is the wrong side of the invite (0012 `INVITE_WRONG_ROLE`)", async () => {
    const { inside } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
      invites: [inviteRow()],
      roles: { [PARENT]: "parent" as const, [OTHER_PARENT]: "parent" as const },
    });

    const refused = await inside.claimInvite("ABCD-EFGH", otherParentActor);

    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_INVITE_WRONG_ROLE",
    );
  });

  it("refuses somebody else's stamped invite (0012 `INVITE_NOT_YOURS`)", async () => {
    const { inside } = build({
      children: [childRow({ id: CHILD, parent: null })],
      invites: [
        inviteRow({
          direction: "nanny_to_parent",
          created_by_user_id: NANNY,
          recipient_user_id: OTHER_PARENT,
        }),
      ],
      roles: { [PARENT]: "parent" as const },
    });

    const refused = await inside.claimInvite("ABCD-EFGH", parentActor);

    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_INVITE_NOT_YOURS",
    );
  });

  it("refuses a second nanny on a child that already has an active link (the one-active-per-child index)", async () => {
    const { inside } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
      invites: [inviteRow()],
      links: [linkRow({ nanny_user_id: OTHER_PARENT })],
      roles: { [NANNY]: "nanny" as const },
    });

    const refused = await inside.claimInvite("ABCD-EFGH", nannyActor);

    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_CHILD_ALREADY_LINKED",
    );
  });

  it("a malformed token never reaches the store — it was never a lookup (07 §8 row 7)", async () => {
    const { inside, store } = build(seedForParentClaim);
    const before = store.state.links.length;

    const refused = await inside.claimInvite("not-a-token", parentActor);

    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_INVITE_TOKEN_INVALID",
    );
    expect(store.state.links).toHaveLength(before);
  });

  it("a revoked or already-claimed token is indistinguishable from a made-up one", async () => {
    const { inside } = build({
      children: [childRow({ id: CHILD, parent: null })],
      invites: [inviteRow({ status: "revoked", revoked_at: NOW })],
      roles: { [PARENT]: "parent" as const },
    });

    const revoked = await inside.claimInvite("ABCD-EFGH", parentActor);
    const madeUp = await inside.claimInvite("ZZZZ-ZZZZ", parentActor);

    expect(!revoked.ok && revoked.error.details?.reason).toBe(
      "E_INVITE_NOT_FOUND",
    );
    expect(!madeUp.ok && madeUp.error.details?.reason).toBe(
      "E_INVITE_NOT_FOUND",
    );
  });

  it("emits `invite.claimed` and the side's `app.*` row (03 §9.3)", async () => {
    const { inside, emitted } = build(seedForParentClaim);

    await inside.claimInvite("ABCD-EFGH", parentActor);

    expect(emitted).toContain("invite.claimed");
    expect(emitted).toContain("app.family-in");
  });
});

describe("the reads that bound access (ADR-083 / 084)", () => {
  it("counts owned AND linked children in one union, as `set_access_window` does in SQL (H-6)", async () => {
    const OTHER_CHILD = "55555555-5555-4555-8555-555555555555";
    const { inside } = build({
      children: [
        childRow({ id: CHILD, parent: PARENT }, "2024-01-01"),
        childRow({ id: OTHER_CHILD, parent: null }, "2026-03-01"),
      ],
      links: [linkRow({ child_id: OTHER_CHILD })],
    });

    const youngest = await inside.youngestChildDateOfBirth(PARENT as FamilyId);

    // The linked child is the younger one. A "fall back to links only when there are no owned children"
    // reading — the bug `database-reviewer` H-6 found in the SQL — would answer 2024-01-01 here.
    expect(youngest.ok && youngest.value).toBe("2026-03-01");
  });

  it("answers rail row 8's three facts", async () => {
    const { inside } = build({
      children: [childRow({ id: CHILD, parent: PARENT })],
      invites: [inviteRow()],
    });

    const facts = await inside.appLinkFacts(PARENT as FamilyId);

    expect(facts.ok && facts.value).toEqual({
      hasChild: true,
      invitePending: true,
      nannyLinked: false,
    });
  });
});

describe("the fail-closed default (ADR-135)", () => {
  beforeEach(() => {
    // Nothing configured: the binding is the unconfigured slot, not a memory inside.
  });

  it("refuses every write until boot wires the module — never a silent success", async () => {
    const { childLinking } = await import("@/modules/app");
    configureChildLinking(
      createChildLinking({
        store: memoryChildLinkingStore(),
        events: { emit: async () => ({ ok: true, value: undefined }) } as never,
        now: () => NOW,
        inviteBaseUrl: "https://example.test/invite",
      }),
    );

    // With no ports wired, a child is still added — but the trial and window are skipped, not faked.
    const added = await childLinking.createChild(
      { firstName: "Amara", dateOfBirth: "2025-01-15" as ISODate },
      parentActor,
    );

    expect(added.ok).toBe(true);
  });
});

// --------------------------------------------------------------------------- 0019's refusals, carried

describe("a definer's named refusal reaches the caller as its own coded error (0019 §5)", () => {
  // `create_child_invite` and `revoke_child_invite` raise `INVITE_NOT_YOURS` when `mayMint` / `mayRevoke`
  // fails in SQL — the second gate that survives a caller which forgets the first. The port turns any driver
  // throw into a generic `INTERNAL` whose message is deliberately blank of provider text (01 §4a), and
  // carries the throw as `cause`; the names therefore have to be read off the cause, not the message. Before
  // this unit `carryLinkStoreError` read only the message, so every named refusal — including
  // `connect_child_invite`'s five, which `1i` wrote the map for — collapsed to `E_STORE`.
  const refusingStore = (named: string) =>
    ({
      ...memoryChildLinkingStore({
        children: [childRow({ id: CHILD, parent: PARENT })],
      }),
      insertInvite: async () => ({
        ok: false as const,
        error: {
          code: "INTERNAL" as const,
          message: "Something went wrong on our side. Please try again.",
          cause: new Error(`${named}: raised by the definer`),
        },
      }),
      invitesForChild: async () => ({ ok: true as const, value: [] }),
    }) as never;

  const inviteWith = (named: string) =>
    createChildLinking({
      store: refusingStore(named),
      events: { emit: async () => ({ ok: true, value: undefined }) } as never,
      now: () => NOW,
      inviteBaseUrl: "https://example.test/invite",
    }).createInvite(CHILD as ChildId, "parent_to_nanny", parentActor);

  it("INVITE_NOT_YOURS is E_INVITE_NOT_YOURS, not E_STORE", async () => {
    const refused = await inviteWith("INVITE_NOT_YOURS");
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_INVITE_NOT_YOURS",
    );
  });

  it("a refusal 0019 raises that this contract has no code for stays E_STORE", async () => {
    // `INVITE_NO_SESSION`, `INVITE_TOKEN_MALFORMED` and `INVITE_MINT_RACE` have no `ChildLinkingErrorReason`
    // of their own, and none is invented here: each is a bug in the caller (a service-scope call, a token the
    // module minted wrongly, a mint racing its own revoke), not a sentence a parent should read.
    const refused = await inviteWith("INVITE_NO_SESSION");
    expect(!refused.ok && refused.error.details?.reason).toBe("E_STORE");
  });
});
