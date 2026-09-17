// 01 §4d — the gate's whole route knowledge in one frozen table: which prefix needs which role, where each role's
// "own dashboard" is, which paths are the `(auth)` group, and the two paths the gate redirects to. Route paths are
// app structure, not config values (05 §6 owns the literal list), so they live here rather than in `config`.
import type { Role } from "../types";

export const ROUTE_MAP = Object.freeze({
  /** Where a signed-out visitor is sent, carrying the attempted path as `next=` (01 §4d step 2). */
  loginPath: "/login",
  /** ADR-042 / 01 §4d step 3 — the one destination for a signed-in account with no password. */
  setPasswordPath: "/set-password",
  /**
   * S-X-09's reset half (04 §6.1). Named here as well as inside `authGroupPaths` because two rules read it: the
   * recovery-session exception below, and the landing path `requestPasswordReset` hands the provider.
   */
  resetPasswordPath: "/reset-password",
  /** `03.06` — where every emailed link lands before the app decides where the person goes (ADR-042). */
  authCallbackPath: "/api/auth/callback",
  nextParam: "next",
  /** Longest-first is irrelevant: the three prefixes are disjoint. Matched on a segment boundary. */
  protectedPrefixes: Object.freeze([
    Object.freeze({ prefix: "/parent", role: "parent" as Role }),
    Object.freeze({ prefix: "/nanny", role: "nanny" as Role }),
    Object.freeze({ prefix: "/admin", role: "admin" as Role }),
  ]),
  /** 01 §4d "wrong role → redirect to that user's own dashboard"; S-P-03 · S-N-11 · S-A-02 (04 §6). */
  dashboards: Object.freeze({
    parent: "/parent",
    nanny: "/nanny",
    admin: "/admin/dashboard",
  } satisfies Readonly<Record<Role, string>>),
  /** The `(auth)` route group (01 §4d): signed-out only; a signed-in user is sent to their dashboard. */
  authGroupPaths: Object.freeze([
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/set-password",
  ]),
});
