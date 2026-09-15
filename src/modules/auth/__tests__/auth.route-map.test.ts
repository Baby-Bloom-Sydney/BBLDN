// The gate's route knowledge (01 §4d): prefix → required role, role → own dashboard, the `(auth)` group, and the
// `next=` login redirect. Pure — no driver, no request.
import { describe, expect, it } from "vitest";
import {
  ROUTE_MAP,
  isAuthGroupPath,
  isAdminRole,
  isNannyRole,
  isParentRole,
  loginRedirectUrl,
  requiredRoleForPath,
  roleDashboardPath,
} from "..";
import { ENUMS } from "@/modules/shared-types";

describe("ROUTE_MAP (01 §4d)", () => {
  it("covers exactly the three roles of 02 §3 user_role — no super_admin", () => {
    expect(Object.keys(ROUTE_MAP.dashboards).sort()).toEqual(
      [...ENUMS.user_role].sort(),
    );
    expect(Object.keys(ROUTE_MAP.dashboards)).not.toContain("super_admin");
  });

  it("is frozen at every level so no caller can retune the gate", () => {
    expect(Object.isFrozen(ROUTE_MAP)).toBe(true);
    expect(Object.isFrozen(ROUTE_MAP.dashboards)).toBe(true);
    expect(Object.isFrozen(ROUTE_MAP.protectedPrefixes)).toBe(true);
  });

  it("puts every role's own dashboard behind that role's own prefix", () => {
    for (const role of ENUMS.user_role) {
      expect(requiredRoleForPath(roleDashboardPath(role))).toBe(role);
    }
  });
});

describe("requiredRoleForPath", () => {
  it.each([
    ["/parent", "parent"],
    ["/parent/request", "parent"],
    ["/nanny", "nanny"],
    ["/nanny/settings", "nanny"],
    ["/admin", "admin"],
    ["/admin/dashboard", "admin"],
  ])("maps %s to %s", (pathname, role) => {
    expect(requiredRoleForPath(pathname)).toBe(role);
  });

  it.each(["/", "/login", "/nannies", "/results", "/invite/abcd-efgh"])(
    "leaves %s public",
    (pathname) => {
      expect(requiredRoleForPath(pathname)).toBeNull();
    },
  );

  it("matches on a path segment, never on a bare prefix", () => {
    // `/parental-leave` must not be gated as a parent route.
    expect(requiredRoleForPath("/parental-leave")).toBeNull();
    expect(requiredRoleForPath("/nannies")).toBeNull();
    expect(requiredRoleForPath("/administration")).toBeNull();
  });
});

describe("isAuthGroupPath", () => {
  it.each([
    "/login",
    "/signup",
    "/signup/parent",
    "/forgot-password",
    "/reset-password",
    "/set-password",
  ])("recognises %s", (pathname) => {
    expect(isAuthGroupPath(pathname)).toBe(true);
  });

  it.each(["/", "/parent", "/loginhelp", "/signups"])(
    "does not claim %s",
    (pathname) => {
      expect(isAuthGroupPath(pathname)).toBe(false);
    },
  );

  it("lists set-password so the 01 §4d step 3 target is inside the group", () => {
    expect(ROUTE_MAP.authGroupPaths).toContain(ROUTE_MAP.setPasswordPath);
  });
});

describe("loginRedirectUrl", () => {
  it("carries the attempted path as next=", () => {
    expect(loginRedirectUrl("/parent/request")).toBe(
      "/login?next=%2Fparent%2Frequest",
    );
  });

  it("carries the query string too", () => {
    expect(loginRedirectUrl("/parent", "?invite=ABCD-EFGH")).toBe(
      "/login?next=%2Fparent%3Finvite%3DABCD-EFGH",
    );
  });

  it.each([
    ["//evil.test/steal", "a protocol-relative URL"],
    ["https://evil.test/steal", "an absolute URL"],
    ["/\\evil.test", "a backslash-smuggled host"],
    ["parent", "a relative path"],
    ["", "an empty path"],
  ])("drops %s (%s) rather than making it an open redirect", (pathname) => {
    expect(loginRedirectUrl(pathname)).toBe("/login");
  });
});

describe("pure role predicates (03 §1.4)", () => {
  it("each predicate is true for its own role only", () => {
    expect([
      isParentRole("parent"),
      isParentRole("nanny"),
      isParentRole("admin"),
    ]).toEqual([true, false, false]);
    expect([
      isNannyRole("parent"),
      isNannyRole("nanny"),
      isNannyRole("admin"),
    ]).toEqual([false, true, false]);
    expect([
      isAdminRole("parent"),
      isAdminRole("nanny"),
      isAdminRole("admin"),
    ]).toEqual([false, false, true]);
  });
});
