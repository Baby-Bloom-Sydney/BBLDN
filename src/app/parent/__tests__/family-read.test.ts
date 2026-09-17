// M-15 — the three answers S-P-03's session read can give, and the one it used to lose.
//
// Written RED against the shipped route, which had `signedInUserId.ok && signedInUserId.value !== null ? … :
// null` and so rendered the logged-out page during an auth outage, silently.
import { describe, expect, it, vi } from "vitest";
import { configureLog, err, ok } from "@/modules/platform";
import type { UserId } from "@/modules/shared-types";
import { familyRead } from "../family-read";

const capture = async (
  run: () => void,
): Promise<ReadonlyArray<Record<string, unknown>>> => {
  const rows: Array<Record<string, unknown>> = [];
  const out = vi.spyOn(console, "error").mockImplementation((line) => {
    rows.push(JSON.parse(String(line)) as Record<string, unknown>);
    return undefined;
  });
  configureLog({ format: "json", minLevel: "info" });
  try {
    run();
  } finally {
    out.mockRestore();
  }
  return rows;
};

describe("S-P-03's session read (M-15)", () => {
  it("a signed-in read is the family", () => {
    expect(familyRead(ok("u-1" as UserId))).toEqual({
      kind: "family",
      familyId: "u-1",
    });
  });

  it("nobody signed in is `signed-out`, and says nothing", async () => {
    const rows = await capture(() => {
      expect(familyRead(ok(null))).toEqual({ kind: "signed-out" });
    });
    expect(rows).toEqual([]);
  });

  it("★ a failed read is `unavailable`, never signed-out, and it is logged with an alert", async () => {
    const rows = await capture(() => {
      expect(
        familyRead(err("INTERNAL", "the session read failed", {})),
      ).toEqual({ kind: "unavailable" });
    });
    expect(rows.map((row) => row.alert)).toContain("ALERT_PROVIDER_DOWN");
  });
});
