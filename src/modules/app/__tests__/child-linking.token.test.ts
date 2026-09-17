// The token claims (02 §4.6; memory `project_invite_token_format` / `_stability`; 07 §8 row 7). These are the
// cheapest tests in the unit and the ones a regression would hurt most: a token is a bearer credential handed
// to a family over WhatsApp, and every property below is load-bearing for the enumeration argument.
import { describe, expect, it } from "vitest";
import { mintInviteToken, normaliseInviteToken } from "@/modules/app";

/** `0012`'s own constraint, copied verbatim so a drift in either direction fails here. */
const DB_CONSTRAINT = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

describe("minting (02 §4.6; the `child_invites_token_shape_check` constraint)", () => {
  it("is XXXX-XXXX with the hyphen in the value, not only in the URL", () => {
    for (let i = 0; i < 200; i += 1) {
      const token = mintInviteToken();
      expect(token).toMatch(DB_CONSTRAINT);
      expect(token).toHaveLength(9);
      expect(token[4]).toBe("-");
    }
  });

  it("never draws I, L, O or U — the four Crockford confusables the constraint excludes", () => {
    const drawn = new Set<string>();
    for (let i = 0; i < 400; i += 1)
      for (const character of mintInviteToken().replace("-", ""))
        drawn.add(character);
    for (const confusable of ["I", "L", "O", "U"])
      expect(drawn.has(confusable)).toBe(false);
    // And the alphabet it *does* use is 32 symbols, which is what 32^8 ≈ 1.1 × 10^12 rests on.
    expect(drawn.size).toBeLessThanOrEqual(32);
  });

  it("maps bytes to symbols uniformly — every symbol is the image of exactly eight byte values", () => {
    // 32 divides 256, so `byte % 32` is unbiased with no rejection sampling. This asserts that directly:
    // feed every byte value in turn and each symbol must come back exactly eight times. A change to the
    // alphabet size that broke the divisibility — and so introduced modulo bias — fails here.
    const counts = new Map<string, number>();
    for (let byte = 0; byte < 256; byte += 1) {
      const symbol = mintInviteToken((into) => into.fill(byte))[0] as string;
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
    expect(counts.size).toBe(32);
    for (const count of counts.values()) expect(count).toBe(8);
  });
});

describe("normalising (07 §8 row 7 — a typo must never become somebody else's lookup)", () => {
  it("accepts the token as minted, lower case, spaced, and without the hyphen", () => {
    expect(normaliseInviteToken("ABCD-EFGH")).toBe("ABCD-EFGH");
    expect(normaliseInviteToken("abcd-efgh")).toBe("ABCD-EFGH");
    expect(normaliseInviteToken("  ABCDEFGH  ")).toBe("ABCD-EFGH");
  });

  it("refuses rather than repairs: a wrong length, a confusable, or anything else is null", () => {
    expect(normaliseInviteToken("ABCD-EFG")).toBeNull();
    expect(normaliseInviteToken("ABCD-EFGHI")).toBeNull();
    expect(normaliseInviteToken("ABCD-EFGI")).toBeNull();
    expect(normaliseInviteToken("ABCD-EFGO")).toBeNull();
    expect(normaliseInviteToken("")).toBeNull();
    expect(normaliseInviteToken("' or 1=1 --")).toBeNull();
  });

  it("every minted token survives its own normaliser unchanged", () => {
    for (let i = 0; i < 200; i += 1) {
      const token = mintInviteToken();
      expect(normaliseInviteToken(token)).toBe(token);
    }
  });
});

describe("07 §8 row 7 — the lookup key (the enumeration defence's other half)", () => {
  it("hashes the address and never carries it in the clear", async () => {
    const { inviteLookupKey } =
      await import("../child-linking/lib/invite-lookup-key");

    const key = await inviteLookupKey("203.0.113.7, 10.0.0.1", "invite-lookup");

    expect(key).not.toContain("203.0.113.7");
    expect(key).toMatch(/^invite-lookup:[0-9a-f]{32}$/);
  });

  it("takes the FIRST forwarded entry — a client cannot append its way into a fresh bucket", async () => {
    const { inviteLookupKey } =
      await import("../child-linking/lib/invite-lookup-key");

    const honest = await inviteLookupKey("203.0.113.7", "invite-lookup");
    const forged = await inviteLookupKey(
      "203.0.113.7, 198.51.100.9, 198.51.100.10",
      "invite-lookup",
    );

    expect(forged).toBe(honest);
  });

  it("off Vercel every caller shares one bucket — the strict answer, not the lax one", async () => {
    const { inviteLookupKey } =
      await import("../child-linking/lib/invite-lookup-key");

    expect(await inviteLookupKey(null, "invite-lookup")).toBe(
      "invite-lookup:no-address",
    );
  });

  it("the rate bucket and the failed-lookup bucket are different keys for the same caller", async () => {
    const { inviteLookupKey } =
      await import("../child-linking/lib/invite-lookup-key");

    const rate = await inviteLookupKey("203.0.113.7", "invite-lookup");
    const miss = await inviteLookupKey("203.0.113.7", "invite-miss");

    expect(rate).not.toBe(miss);
  });
});
