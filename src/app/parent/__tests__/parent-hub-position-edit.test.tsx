// The hub's position card, and the road a family takes from it to change what she asked for.
//
// **The defect this suite exists to keep out.** `/parent` → `ParentHubClient` → `MyChildcareTab` rendered
// `PositionDetailView` with an inline **Edit** whose Save called `saveTypeformPosition` — a session-scope write
// to `nanny_positions` addressing columns the London schema does not have, on a table where `authenticated`
// holds `SELECT` and nothing else (`int.client-grants`). Measured against the applied migrations: the read
// raises `42703` (`column nanny_positions.status does not exist`) and the write `42501` (`permission denied for
// table nanny_positions`). Either way the family's change never reached the row, and that card was the only
// place the hub offered to make one.
//
// So the card carries **no save road at all** now, and the one road it offers is the one P1-EDIT built:
// S-P-04 in its edit state (`/parent/request` → `amendPositionAction` → `positions.amend` → `upsert_position`),
// shown exactly when `positions` says she may still amend (04 §6.2; `parent-may-amend.ts`). Fail closed: the
// prop defaults to "she may not", so a caller that forgets to ask shows no edit road rather than a broken one.
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MyChildcareTab } from "@/components/parent/MyChildcareTab";
import { PositionDetailView } from "@/app/parent/request/renderers/PositionDetailView";
import type { PositionWithChildren } from "@/lib/actions/parent";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const position = {
  id: "0f1e2d3c-0000-4000-8000-0000000000a1",
  details: { form_data: { suburb: "Clapham", num_children: 1 } },
  children: [],
} as unknown as PositionWithChildren;

const EDIT_HREF = "/parent/request";

/** The card's `…` menu, the only thing on it that used to open the inline editor. */
const openCardMenu = () => {
  const buttons = screen.getAllByRole("button");
  const menu = buttons[buttons.length - 1];
  fireEvent.click(menu);
};

describe("the hub's position card offers no write of its own", () => {
  it("offers no Edit in its menu for a family who may still amend", () => {
    render(<MyChildcareTab position={position} canEdit />);
    openCardMenu();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save changes/i })).toBeNull();
  });

  it("offers no Edit in its menu for a family who may not", () => {
    render(<MyChildcareTab position={position} canEdit={false} />);
    openCardMenu();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save changes/i })).toBeNull();
  });

  // `onSave` is the only save road the component has left, and it is nobody's today. With none it renders no
  // edit toggle at all, however it is driven — the read-only card is the whole of what it can be.
  it("renders no edit toggle when no caller gave it somewhere to save", () => {
    render(<PositionDetailView initialData={{ suburb: "Clapham" }} />);
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^done$/i })).toBeNull();
  });

  // A behavioural test alone would pass against a component that still held the import and merely hid the
  // control, so the road itself is asserted gone (the S5d pattern).
  it("no longer carries the Sydney write action at all", () => {
    const view = readFileSync(
      "src/app/parent/request/renderers/PositionDetailView.tsx",
      "utf8",
    );
    expect(view).not.toMatch(/saveTypeformPosition\s*\(/);
    expect(view).not.toMatch(/from "@\/lib\/actions\/parent"/);
    // Gone from the module that exported it, so no importer can reach it again. (The name survives in the
    // note left where it stood, which is why this asks for the declaration rather than the string.)
    const actions = readFileSync("src/lib/actions/parent.ts", "utf8");
    expect(actions).not.toMatch(
      /export\s+(async\s+)?function\s+saveTypeformPosition/,
    );
  });
});

describe("the one edit road, gated the way positions gates the write", () => {
  it("links to S-P-04's edit state when she may still amend", () => {
    render(<MyChildcareTab position={position} canEdit />);
    const link = screen.getByRole("link", {
      name: /change what you asked for/i,
    });
    expect(link).toHaveAttribute("href", EDIT_HREF);
  });

  it("offers no edit road when she may not — the matchmaker makes the change", () => {
    render(<MyChildcareTab position={position} canEdit={false} />);
    expect(
      screen.queryByRole("link", { name: /change what you asked for/i }),
    ).toBeNull();
  });

  it("fails closed when nobody asked positions whether she may", () => {
    render(<MyChildcareTab position={position} />);
    expect(
      screen.queryByRole("link", { name: /change what you asked for/i }),
    ).toBeNull();
  });
});
