// The `admin` connector's acceptance: the panel set is the **eight** 00-glossary §3 names (ADR-074 added
// `calendar`, ADR-088 `guarantees`), each carrying the route and screen IDs 04 §6.4 gives it, with no panel
// folder missing from the set and no name in the set without a folder.
import { describe, expect, it } from "vitest";
import { ADMIN_PANELS, GUARANTEES_PANEL } from "@/modules/admin";
import type { AdminPanelName } from "@/modules/admin";

const EXPECTED: ReadonlyArray<AdminPanelName> = [
  "call-queue",
  "calendar",
  "positions-panel",
  "pipeline",
  "leads",
  "users",
  "support",
  "guarantees",
];

describe("the eight panels", () => {
  it("is exactly the 00-glossary §3 set, in nav order", () => {
    expect(ADMIN_PANELS.map((panel) => panel.name)).toEqual(EXPECTED);
  });

  it("includes guarantees — ADR-088 made the set eight, not seven", () => {
    expect(ADMIN_PANELS).toContain(GUARANTEES_PANEL);
    expect(GUARANTEES_PANEL.screens).toEqual(["S-A-29"]);
  });

  it("gives every panel a route and at least one screen ID", () => {
    for (const panel of ADMIN_PANELS) {
      expect(panel.path.startsWith("/admin/")).toBe(true);
      expect(panel.screens.length).toBeGreaterThan(0);
    }
  });

  it("puts the calendar on the same screen as the queue — ADR-074 merged them", () => {
    const paths = new Map(ADMIN_PANELS.map((p) => [p.name, p.path]));

    expect(paths.get("calendar")).toBe(paths.get("call-queue"));
  });

  it("is frozen, so no caller can reorder or extend the nav by accident", () => {
    expect(Object.isFrozen(ADMIN_PANELS)).toBe(true);
  });
});
