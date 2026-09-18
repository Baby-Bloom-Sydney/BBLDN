// ADR-178 — **the visitor cookie's signing key is its own secret.** `3e` derived it by HKDF from `CRON_SECRET`,
// which is cryptographically fine and operationally wrong: it couples two unrelated trust domains, so rotating
// the cron Bearer silently invalidates every visitor's consent cookie, and a leaked cron Bearer becomes a key for
// forging consent records — the one artefact whose whole value is that it evidences what a person actually chose.
//
// The ruling is not a comment, so it is not asserted as one. Both halves are driven against the module: the
// signature **moves** when `VISITOR_COOKIE_SECRET` changes (so rotation does what rotation is for) and **does not
// move** when `CRON_SECRET` changes (so the two secrets are genuinely apart). A test that only checked the first
// would have passed on `3e`'s code too.
import { beforeEach, describe, expect, it, vi } from "vitest";

const secrets = {
  CRON_SECRET: "cron-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  VISITOR_COOKIE_SECRET: "visitor-secret-bbbbbbbbbbbbbbbbbbbbbbbb",
};

vi.mock("@/modules/config/server", () => ({
  env: {
    environment: "test",
    public: {},
    get server() {
      return secrets;
    },
  },
}));

const { mintVisitorId, visitorCookieHeader, visitorIdOf } =
  await import("../visitor-cookie");

/** The `Set-Cookie` the route would send, replayed as the `Cookie` a browser would send back. */
function roundTrip(id: string): string | null {
  const setCookie = visitorCookieHeader(id);
  const value = setCookie.split(";")[0] ?? "";
  return visitorIdOf(
    new Request("https://example.test/", { headers: { cookie: value } }),
  );
}

describe("visitor-cookie — the key is VISITOR_COOKIE_SECRET's, and nobody else's (ADR-178)", () => {
  beforeEach(() => {
    secrets.CRON_SECRET = "cron-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    secrets.VISITOR_COOKIE_SECRET = "visitor-secret-bbbbbbbbbbbbbbbbbbbbbbbb";
  });

  it("verifies a cookie it minted", () => {
    const id = mintVisitorId();
    expect(roundTrip(id)).toBe(id);
  });

  it("★ rotating CRON_SECRET does NOT invalidate a visitor's cookie", () => {
    const id = mintVisitorId();
    const header = visitorCookieHeader(id).split(";")[0] ?? "";
    secrets.CRON_SECRET = "cron-secret-rotated-ccccccccccccccccccccc";
    expect(
      visitorIdOf(
        new Request("https://example.test/", { headers: { cookie: header } }),
      ),
    ).toBe(id);
  });

  it("★ rotating VISITOR_COOKIE_SECRET does — and the next visitor is re-asked", () => {
    const id = mintVisitorId();
    const header = visitorCookieHeader(id).split(";")[0] ?? "";
    secrets.VISITOR_COOKIE_SECRET = "visitor-secret-rotated-dddddddddddddddd";
    expect(
      visitorIdOf(
        new Request("https://example.test/", { headers: { cookie: header } }),
      ),
    ).toBeNull();
  });

  it("a cookie signed under a different secret is the no-cookie case, not an error", () => {
    const id = mintVisitorId();
    const header = visitorCookieHeader(id).split(";")[0] ?? "";
    secrets.VISITOR_COOKIE_SECRET = "someone-elses-secret-eeeeeeeeeeeeeeeeee";
    expect(() =>
      visitorIdOf(
        new Request("https://example.test/", { headers: { cookie: header } }),
      ),
    ).not.toThrow();
  });

  it("a value that cannot even be decoded is the no-cookie case (3e's HIGH, kept)", () => {
    expect(
      visitorIdOf(
        new Request("https://example.test/", {
          headers: { cookie: "bb_visitor=%" },
        }),
      ),
    ).toBeNull();
  });
});
