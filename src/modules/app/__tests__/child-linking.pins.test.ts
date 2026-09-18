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

describe("PIN FLIPPED (`2g`) — 04 §4.4 c1: a nanny adds an existing client and mints a token for them", () => {
  // **Flipped by behaviour, not by assertion.** `1i` pinned this because the schema could not say the row was
  // hers; `0019` landed `children.created_by_user_id` (trigger-stamped), the fourth arm of
  // `user_has_child_access()` and `create_child_invite()`'s creator branch, and `2g` landed the three module
  // edits the pin itself named — `ChildFacts.createdByUserId`, `mayMint`'s `nanny_to_parent` arm, and
  // `invite-methods` reading the column back. The behaviour that makes it green is measured end to end in
  // `child-linking.nanny-mint.test.ts` (she creates the child, she mints, a stranger cannot, the family's
  // claim closes the arm). This read stays as the pin's own epitaph: the same call, now answering `true`.
  it("a nanny may mint a `nanny_to_parent` invite for the child she just created", () => {
    expect(
      inviteAuthorisation.mayMint(nannyActor, "nanny_to_parent", {
        parentUserId: null,
        createdByUserId: NANNY as UserId,
        linkedNannyUserIds: [],
      }),
    ).toBe(true);
  });

  it("a LINKED nanny and an admin still can, so every road in 04 §4.4 c1 is reachable", async () => {
    expect(
      inviteAuthorisation.mayMint(nannyActor, "nanny_to_parent", {
        parentUserId: null,
        createdByUserId: null,
        linkedNannyUserIds: [NANNY as UserId],
      }),
    ).toBe(true);
    expect(
      inviteAuthorisation.mayMint(
        {
          kind: "admin",
          id: "admin-1" as never,
          // An admin acts on behalf of a named person or not at all (security review M1).
          onBehalfOf: { role: "nanny", id: NANNY as UserId },
        },
        "nanny_to_parent",
        {
          parentUserId: null,
          createdByUserId: null,
          linkedNannyUserIds: [],
        },
      ),
    ).toBe(true);
  });
});

describe("★ PIN — 07 §5.2: 'links and invites are written only by the RPCs'", () => {
  // **Half of this pin is flipped by `0019`, and half of it is not — so it is split rather than declared
  // closed.** `1i` wrote one claim covering two facts: that the definers exist, and that the module goes
  // through them. `0019` makes the first true and leaves the second exactly where `1i` left it.
  //
  // `1i` also addressed the assertion at `0012_app.sql` specifically, and noted it. That was a defect in the
  // pin's *address*, not in its claim — the functions were always going to arrive in a later migration — so
  // the read below is re-pointed at the whole ordered set. The claim is unchanged.
  it("the mint and the revoke exist as SECURITY DEFINER functions in the migration set (0019)", async () => {
    // Read the migration set itself rather than the generated types: the claim is about what `supabase/`
    // ships, and reaching into another module's inside for it would break the boundary lint (correctly).
    const { readdirSync, readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const dir = resolve(__dirname, "../../../../supabase/migrations");
    const sql = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => readFileSync(resolve(dir, name), "utf8"))
      .join("\n");

    expect(sql).toContain("function public.create_child_invite");
    expect(sql).toContain("function public.revoke_child_invite");
    // and they are the session road, which is what makes them a second gate rather than a rename of the
    // service-scoped write they replace
    expect(sql).toContain(
      "grant execute on function public.create_child_invite(uuid, public.invite_direction, text) to authenticated",
    );
  });

  // **Flipped.** `db-child-linking-store.ts` calls both definers, under the caller's own session — so
  // `invite-authorisation.ts` is no longer the only gate a request passes through, and a service-scope mint
  // is now refused by Postgres (`INVITE_NO_SESSION`) rather than quietly succeeding. The behaviour that makes
  // this green is asserted in `db-write-definers.test.ts` (the calls, the arguments, the scope, the
  // idempotent second mint, the terminal revoke) and in `int.rpc-0019-app` against the applied migration;
  // this read stays because the pin's claim was about the *file*, and a future edit that put the table write
  // back would pass every behavioural test written against the double.
  it("the module's store calls those definers instead of writing `child_invites` at service scope", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const store = readFileSync(
      resolve(__dirname, "../child-linking/lib/db-child-linking-store.ts"),
      "utf8",
    );

    expect(store).toContain('rpc("create_child_invite"');
    expect(store).toContain('rpc("revoke_child_invite"');
    // and no table write of either is left behind
    expect(store).not.toContain('from("child_invites").insert');
    expect(store).not.toContain('from("child_invites").update');
  });

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
