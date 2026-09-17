// `07.09` / `07.59` — the gate consumers, and the one claim this whole unit turns on: **a closed app and an
// app we could not check are different answers all the way to the screen.**
//
// `accessGate.hasAccess` fails closed by carrying `payments`' error rather than returning a defaulted
// `{ open: false }` (`1h`). That choice is worth nothing if a consumer flattens it into a boolean, which is
// exactly what the Sydney `requireChildFamilyAccess` did — it answered `{ hasAccess, reason }`, so every
// outage read as a lapse and a paying family got a demand for money during a database blip. These are the
// tests that stop that coming back.
import { describe, expect, it } from "vitest";
import { childAppGate, katieAccessGate } from "@/modules/app";
import { appAccessView } from "../child-linking/lib/app-access-view";
import { childrenCardView } from "../child-linking/lib/children-card-view";

describe("the three-valued gate (`07.59`)", () => {
  it("open when the gate says open", () => {
    expect(childAppGate({ open: true, reason: "trial" })).toEqual({
      kind: "open",
    });
  });

  it("closed carries the standing's own name, so the screen need not invent a second vocabulary", () => {
    expect(childAppGate({ open: false, reason: "lapsed" })).toEqual({
      kind: "closed",
      reason: "lapsed",
    });
  });

  it("★ a carried error is `unknown`, never `closed`", () => {
    expect(childAppGate(null)).toEqual({ kind: "unknown" });
  });
});

describe("★ the unknown state never shows a paywall", () => {
  it("the app view offers no action at all when we could not check", () => {
    const view = appAccessView({ access: null, children: [] });

    expect(view.kind).toBe("unknown");
    expect(view).not.toHaveProperty("action");
  });

  it("the children card renders the outage state, not the empty-family state", () => {
    const view = childrenCardView({
      access: null,
      children: [],
      invites: [],
      linkedChildIds: [],
    });

    expect(view.kind).toBe("gate");
    expect(view.kind === "gate" && view.gate.kind).toBe("unknown");
  });

  it("the unknown copy says nothing has changed — it is about us, not about the family", () => {
    const view = appAccessView({ access: null, children: [] });

    expect(view.kind === "unknown" && view.body).toContain(
      "Nothing has changed with your account",
    );
  });
});

describe("Katie's gate (`07.09`; 07 §10.1 — tools re-check access per call)", () => {
  it("lets a tool run when the app is open", () => {
    expect(katieAccessGate({ open: true, reason: "active" }, "Amara")).toEqual({
      kind: "ok",
    });
  });

  it("★ answers an outage in its own words — never 'your app has lapsed'", () => {
    const gate = katieAccessGate(null, "Amara");

    expect(gate.kind).toBe("unknown");
    expect(gate.kind === "unknown" && gate.line).toContain(
      "nothing has changed with your app",
    );
  });

  it("blocks a closed app without asking for money in the chat", () => {
    const gate = katieAccessGate({ open: false, reason: "lapsed" }, "Amara");

    expect(gate.kind).toBe("blocked");
    expect(gate.kind === "blocked" && gate.line).toContain(
      "still there waiting",
    );
  });

  it("an admin's off-toggle points at the matchmaker, as it does everywhere else (ADR-093)", () => {
    const gate = katieAccessGate(
      { open: false, reason: "toggled-off" },
      "Amara",
    );

    expect(gate.kind === "blocked" && gate.line).toContain("matchmaker");
  });
});

describe("the security review's closed findings (H1 · M1 · M3)", () => {
  it("★ M1 — an admin with no `onBehalfOf` may neither mint nor revoke", async () => {
    const { inviteAuthorisation } = await import("@/modules/app");
    const bare = { kind: "admin", id: "a1" } as never;
    const named = {
      kind: "admin",
      id: "a1",
      onBehalfOf: { role: "parent", id: "p1" },
    } as never;

    // A bare admin's mint would write `created_by_user_id = null`: a live share link for somebody's child
    // that no audit trail can attribute and only another admin can revoke.
    expect(
      inviteAuthorisation.mayMint(bare, "parent_to_nanny", {
        parentUserId: null,
        linkedNannyUserIds: [],
      }),
    ).toBe(false);
    expect(inviteAuthorisation.mayRevoke(bare, null)).toBe(false);
    expect(
      inviteAuthorisation.mayMint(named, "parent_to_nanny", {
        parentUserId: "p1" as never,
        linkedNannyUserIds: [],
      }),
    ).toBe(true);
    expect(inviteAuthorisation.mayRevoke(named, null)).toBe(true);
  });

  it("★ M3 — a linked nanny's mint reads the links of the CHILD, not of a family that does not exist yet", async () => {
    const { createChildLinking, memoryChildLinkingStore } =
      await import("@/modules/app");
    const CHILD = "33333333-3333-4333-8333-333333333333";
    const NANNY = "22222222-2222-4222-8222-222222222222";
    const NOW = "2026-09-17T09:00:00.000Z";

    const inside = createChildLinking({
      store: memoryChildLinkingStore({
        // A `nanny_to_parent` invite exists precisely when the child has NO parent — so a lookup keyed on the
        // family key matched nothing and this branch was unreachable.
        children: [
          {
            id: CHILD,
            parent_user_id: null,
            first_name: "Amara",
            date_of_birth: "2025-01-15",
            gender: null,
            profile_image_id: null,
            status: "active",
            onboarded: true,
            orphaned_at: null,
            feed_locked_for_nanny: false,
            feed_locked_at: null,
            created_at: NOW,
            updated_at: NOW,
          } as never,
        ],
        links: [
          {
            id: "l1",
            child_id: CHILD,
            nanny_user_id: NANNY,
            parent_user_id: null,
            placement_id: null,
            source: "invite",
            state: "active",
            ended_at: null,
            ended_by: null,
            end_reason: null,
            created_at: NOW,
          } as never,
        ],
      }),
      events: { emit: async () => ({ ok: true, value: undefined }) } as never,
      now: () => NOW as never,
      inviteBaseUrl: "https://example.test/invite",
    });

    const made = await inside.createInvite(CHILD as never, "nanny_to_parent", {
      kind: "user",
      id: NANNY as never,
      role: "nanny",
    });

    expect(made.ok).toBe(true);
  });

  // ── M-6 (REVIEW-2) — the read side of the same rule ──────────────────────────────────────────────────────
  //
  // Security review M1 required `onBehalfOf` on mint and revoke; the **read** was left as `actor.kind ===
  // "admin"`, and `invitesForChild` returns the full share URL — token and all — for any `childId`. Same class,
  // left open on one side. RED first.
  it("★ M-6 — a bare admin cannot read a child's live invite tokens either", async () => {
    const { createChildLinking, memoryChildLinkingStore } =
      await import("@/modules/app");
    const CHILD = "33333333-3333-4333-8333-333333333333";
    const PARENT = "44444444-4444-4444-8444-444444444444";
    const NOW = "2026-09-17T09:00:00.000Z";
    const inside = createChildLinking({
      store: memoryChildLinkingStore({
        children: [
          {
            id: CHILD,
            parent_user_id: PARENT,
            first_name: "Amara",
            date_of_birth: "2025-01-15",
            gender: null,
            profile_image_id: null,
            status: "active",
            onboarded: true,
            orphaned_at: null,
            feed_locked_for_nanny: false,
            feed_locked_at: null,
            created_at: NOW,
            updated_at: NOW,
          } as never,
        ],
      }),
      events: { emit: async () => ({ ok: true, value: undefined }) } as never,
      now: () => NOW as never,
      inviteBaseUrl: "https://example.test/invite",
    });

    const bare = await inside.invitesForChild(CHILD as never, {
      kind: "admin",
      id: "a1" as never,
    });
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.error.details?.reason).toBe("E_ACTOR_FORBIDDEN");

    const named = await inside.invitesForChild(CHILD as never, {
      kind: "admin",
      id: "a1" as never,
      onBehalfOf: { role: "parent", id: PARENT as never },
    });
    expect(named.ok).toBe(true);
  });
});
