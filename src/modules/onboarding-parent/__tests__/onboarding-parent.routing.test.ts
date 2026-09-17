// `03.36` post-signup routing (04 §3.2 / §3.3) and the two query readers the routes use.
import { describe, expect, it } from "vitest";
import type { LeadId } from "@/modules/shared-types";
import { postSignupDestination } from "../lib/post-signup-destination";
import { safeNextPath } from "../lib/safe-next-path";
import { signupContextFromQuery } from "../lib/signup-context-from-query";

describe("onboarding-parent — postSignupDestination (03.36)", () => {
  it("sends a parent whose position opened to the call page S-P-01 (path B, trigger a)", () => {
    expect(postSignupDestination({}, true)).toEqual({
      destination: "/parent/call",
      positionOpened: true,
    });
  });

  it("sends an invite arrival to the claim S-P-14 (path E)", () => {
    expect(postSignupDestination({ inviteToken: "ABCD-EFGH" }, false)).toEqual({
      destination: "/invite/connect/ABCD-EFGH",
      positionOpened: false,
    });
  });

  it("sends a profile signup to S-P-03 with the nanny remembered (path D)", () => {
    expect(postSignupDestination({ nannyId: "n-1" }, false).destination).toBe(
      "/parent?nanny=n-1",
    );
  });

  it("sends a cold signup to S-P-03 state 0 (path C)", () => {
    expect(postSignupDestination({}, false).destination).toBe("/parent");
  });
});

describe("onboarding-parent — safeNextPath (01 §4d step 2)", () => {
  it.each(["/parent", "/parent/call?x=1"])("keeps %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "parent",
    "",
    null,
    undefined,
  ])("refuses %s", (raw) => {
    expect(safeNextPath(raw)).toBeNull();
  });
});

describe("onboarding-parent — signupContextFromQuery (04 §3.2)", () => {
  it("reads the lead as path B", () => {
    expect(signupContextFromQuery({ lead: "L1" })).toEqual({
      source: "advanced_match",
      leadId: "L1" as LeadId,
    });
  });
  it("reads the invite as path E and the nanny as path D", () => {
    expect(signupContextFromQuery({ invite: "ABCD-EFGH" })).toEqual({
      source: "invite",
      inviteToken: "ABCD-EFGH",
    });
    expect(signupContextFromQuery({ nanny: "n-1" })).toEqual({
      source: "profile",
      nannyId: "n-1",
    });
  });
  it("reads src=std as the quick-match path A and nothing as cold", () => {
    expect(signupContextFromQuery({ src: "std" }).source).toBe(
      "standard_match",
    );
    expect(signupContextFromQuery({}).source).toBe("cold");
    expect(signupContextFromQuery({ lead: ["a", "b"] }).source).toBe("cold");
  });
});
