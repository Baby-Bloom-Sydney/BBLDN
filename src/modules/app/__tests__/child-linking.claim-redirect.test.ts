// ── M-7 (REVIEW-2) — the token a signed-out claim carries into the login redirect ──────────────────────────
//
// `claimInviteAction` spliced the **raw form string** into `/login?redirect=/invite/connect/${token}`.
// `normaliseInviteToken` runs later, inside `claimInvite`, so a value carrying `?`, `#` or `&` reshaped the
// parameter that the login screen's `safeNextPath` later consumes. Same-origin-anchored, so not a full open
// redirect — and the sibling `post-signup-destination.ts:19` does encode, which is what makes this an omission
// rather than a convention.
//
// The fix is the order the token is already handled in everywhere else: **normalise first** (02 §4.6's
// `XXXX-XXXX`, the only shape that can ever be looked up), then encode. A string that is not a token is not
// carried at all — there is nothing to come back to.
//
// Both cases were written RED against the shipped action.
import { describe, expect, it, vi } from "vitest";

const redirects: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirects.push(to);
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: () => ({ get: () => "203.0.113.7" }),
}));
/** Signed out: the one branch that builds a redirect out of the caller's string. */
vi.mock("../child-linking/lib/app-actor", () => ({
  appActor: async () => null,
}));

const { claimInviteAction } =
  await import("../child-linking/actions/claim-invite-action");

const submit = async (token: string): Promise<string> => {
  redirects.length = 0;
  const form = new FormData();
  form.set("token", token);
  await claimInviteAction(null, form).catch(() => undefined);
  return redirects.at(-1) ?? "";
};

describe("a signed-out claim carries a normalised, encoded token (M-7)", () => {
  it("normalises before it builds the URL, so the round trip is the token we would look up", async () => {
    // Lower case and no hyphen is a shape people retype from a message; `normaliseInviteToken` accepts it.
    expect(await submit("ab2cd3ef")).toBe(
      `/login?redirect=${encodeURIComponent("/invite/connect/AB2C-D3EF")}`,
    );
  });

  it("carries nothing at all when the string is not a token", async () => {
    // `?redirect=` is the parameter being built; a token containing one would reshape it.
    for (const raw of ["", "not-a-token", "AB2C-D3EF?x=1", "AB2C-D3EF#frag"])
      expect(await submit(raw)).toBe("/login");
  });
});
