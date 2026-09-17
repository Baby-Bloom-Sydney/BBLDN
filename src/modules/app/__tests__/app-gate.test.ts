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
