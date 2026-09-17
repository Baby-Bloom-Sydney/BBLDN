// The gaps `1i` found and did not paper over (ADR-120 rule 2 — where code and a foundation document disagree,
// the document wins: pin the documented behaviour as a failing test and record it). Each `it.fails` is a claim
// the foundations make that the schema cannot honour today, with its owner named. They are flipped, not
// rediscovered.
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

const NANNY = "22222222-2222-4222-8222-222222222222";
const CHILD = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-09-17T09:00:00.000Z" as Instant;

const nannyActor: Actor = { kind: "user", id: NANNY as UserId, role: "nanny" };

const unownedChild = {
  id: CHILD,
  parent_user_id: null,
  first_name: "Amara",
  date_of_birth: "2025-01-15",
  gender: null,
  profile_image_id: null,
  status: "active",
  onboarded: true,
  orphaned_at: null,
  feed_locked_for_nanny: true,
  feed_locked_at: NOW,
  created_at: NOW,
  updated_at: NOW,
} as never;

const build = () =>
  createChildLinking({
    store: memoryChildLinkingStore({ children: [unownedChild] }),
    events: { emit: async () => ({ ok: true, value: undefined }) } as never,
    now: () => NOW,
    inviteBaseUrl: "https://example.test/invite",
  });

describe("★ PIN — 04 §4.4 c1: a nanny adds an existing client and mints a token for that family", () => {
  it.fails(
    "a nanny may mint a `nanny_to_parent` invite for the child she just created (owner: 02 §4.6)",
    async () => {
      // `children` has **no creator column**, and `user_has_child_access` admits only the parent, an actively
      // linked nanny, or an admin. So a nanny cannot read back the child she created, let alone prove the row
      // is hers — there is nothing in the schema that says so. 04 §4.4 c1 and the parent's path E both depend
      // on this working. The fix is 02 §4.6's: `children` wants a `created_by_user_id`, or
      // `user_has_child_access` a fourth arm for the unlinked creator of an unclaimed child. Until then
      // `invite-authorisation.ts` authorises a **linked** nanny or an admin, path E runs from the admin's side
      // (S-A-11, `09.28`), and this is the claim that flips when the column lands.
      const allowed = inviteAuthorisation.mayMint(
        nannyActor,
        "nanny_to_parent",
        {
          parentUserId: null,
          linkedNannyUserIds: [],
        },
      );

      expect(allowed).toBe(true);
    },
  );

  it("meanwhile a LINKED nanny and an admin can, so the claim path is reachable end to end", async () => {
    expect(
      inviteAuthorisation.mayMint(nannyActor, "nanny_to_parent", {
        parentUserId: null,
        linkedNannyUserIds: [NANNY as UserId],
      }),
    ).toBe(true);
    expect(
      inviteAuthorisation.mayMint(
        { kind: "admin", id: "admin-1" as never },
        "nanny_to_parent",
        { parentUserId: null, linkedNannyUserIds: [] },
      ),
    ).toBe(true);
  });
});

describe("★ PIN — 07 §5.2: 'links and invites are written only by the RPCs'", () => {
  it.fails(
    "the mint and the revoke go through SECURITY DEFINER functions, not a service-scoped write (owner: a `0019`)",
    async () => {
      // `0012` ships `connect_child_invite`, `ensure_placement`, `remove_nanny_from_child` and
      // `nanny_leave_child` — the claim and the unlinks. It ships **no function for the mint and none for the
      // revoke**, and `child_invites` has a SELECT policy with no client INSERT or UPDATE. So this module
      // writes both at service scope, and `invite-authorisation.ts` is the *only* authorisation there is:
      // there is no second check in Postgres behind it.
      //
      // A `0019` should add `create_child_invite(p_child_id, p_direction)` and
      // `revoke_child_invite(p_invite_id, p_reason)`, both SECURITY DEFINER with `search_path` pinned,
      // asserting the same two rules in SQL. This unit may not write a migration, so the claim is pinned and
      // the functions are named in `child-linking-store.ts`'s header.
      const functions = await import("../../shared-types/database.types");
      const names = Object.keys(
        (functions as { Database?: never }).Database ?? {},
      );

      expect(names).toContain("create_child_invite");
    },
  );

  it("meanwhile the module's authorisation is real and is tested — it is the only gate", async () => {
    const inside = build();

    // A nanny with no link to this unowned child cannot mint, which is the rule the definer would assert.
    const refused = await inside.createInvite(
      CHILD as ChildId,
      "nanny_to_parent",
      nannyActor,
    );

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.details?.reason).toBe(
      "E_ACTOR_FORBIDDEN",
    );
  });
});

describe("★ PIN — the claim's own unit of work", () => {
  it.fails(
    "the access window moves inside `connect_child_invite`'s transaction, not after it (owner: 02 §7)",
    async () => {
      // `connect_child_invite` is one definer call and therefore one transaction (ADR-127). The
      // `set_access_window` call that ADR-084 owes happens **after** it returns, from this module, so a crash
      // between the two leaves a linked child whose family's `access_until` has not moved forward. It is not
      // urgent — the next paid transition, the next link and the `expire-*` sweeps all recompute it from the
      // same rows, and the failure direction is a window that is too short rather than one that is too long —
      // but the honest fix is for `connect_child_invite` to call `set_access_window` itself before it returns,
      // which is a migration this unit may not write.
      const store = memoryChildLinkingStore();
      const calls: string[] = [];
      const inside = createChildLinking({
        store,
        events: { emit: async () => ({ ok: true, value: undefined }) } as never,
        now: () => NOW,
        inviteBaseUrl: "https://example.test/invite",
        setAccessWindow: async () => {
          calls.push("window");
          return { ok: true as const, value: null };
        },
      });
      await inside.createChild(
        { firstName: "Amara", dateOfBirth: "2025-01-15" as ISODate },
        { kind: "user", id: "p1" as UserId, role: "parent" },
      );

      // The claim would be: the RPC did it, so the module never had to.
      expect(calls).toEqual([]);
    },
  );
});
