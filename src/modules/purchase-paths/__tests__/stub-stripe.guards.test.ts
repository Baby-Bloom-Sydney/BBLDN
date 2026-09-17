// The three guards of 07 §5.5, each of which must be **sufficient alone**, plus the compare that carries the
// third. `1h` rewrote `constantTimeEquals` from `node:crypto` to pure arithmetic so the provider could be wired
// at boot; a security primitive that changed mechanism needs its properties re-proved, not assumed.
import { describe, expect, it } from "vitest";
import { constantTimeEquals } from "../providers/stub-stripe/lib/constant-time-equals";
import { assertStubAllowed } from "../providers/stub-stripe/lib/assert-stub-allowed";
import { stubStripe } from "../providers/stub-stripe";

const SECRET = "a-stub-event-secret";

describe("constantTimeEquals", () => {
  it("is true only for an exact match", () => {
    expect(constantTimeEquals(SECRET, SECRET)).toBe(true);
    expect(constantTimeEquals(SECRET, `${SECRET}x`)).toBe(false);
    expect(constantTimeEquals(SECRET, SECRET.toUpperCase())).toBe(false);
    expect(constantTimeEquals(SECRET, SECRET.slice(0, -1))).toBe(false);
  });

  it("is false for two empty strings — an absent secret is not a secret that matches", () => {
    // The trap the F-c review caught: `timingSafeEqual(hash(''), hash(''))` is `true`, so a deployment with the
    // secret unset would have accepted an unsigned event. This compare still says `true` for two empty strings,
    // which is why `stubStripe` refuses a blank secret before ever reaching it — the case below.
    expect(constantTimeEquals("", "")).toBe(true);
  });

  it("differs only in the last character and still says no", () => {
    expect(constantTimeEquals("aaaaaaaaaaaa", "aaaaaaaaaaab")).toBe(false);
  });

  it("refuses anything past the window rather than comparing a prefix", () => {
    const long = "x".repeat(300);
    expect(constantTimeEquals(long, long)).toBe(false);
    // Two strings that agree on the first 256 characters and differ after must never compare equal.
    expect(
      constantTimeEquals(`${"x".repeat(256)}a`, `${"x".repeat(256)}b`),
    ).toBe(false);
  });

  it("touches no Node builtin — that is what let the provider be wired at boot", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(
        __dirname,
        "../providers/stub-stripe/lib/constant-time-equals.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/from "node:/u);
  });
});

describe("layer 1 — the stub cannot exist in production (07 §5.5; ADR-108)", () => {
  it("refuses to construct, by throwing rather than returning a Result", () => {
    expect(() => assertStubAllowed("production")).toThrow();
    expect(() =>
      stubStripe({
        eventSecret: SECRET,
        environment: "production",
        appUrl: "https://app",
      }),
    ).toThrow();
  });

  it("constructs in development and preview", () => {
    for (const environment of ["development", "preview"] as const)
      expect(() =>
        stubStripe({ eventSecret: SECRET, environment, appUrl: "https://app" }),
      ).not.toThrow();
  });
});

describe("layer 3 — parseEvent fails closed on the shared secret", () => {
  const provider = stubStripe({
    eventSecret: SECRET,
    environment: "preview",
    appUrl: "https://app",
  });

  const event = {
    kind: "purchase.completed",
    eventId: "evt-1",
    ref: "11111111-2222-4333-8444-555555555555.checkout.11111111-2222-4333-8444-555555555556",
    linkKind: "checkout",
    preset: "self-serve-app",
    shape: { kind: "upfront" },
    paid: { pence: 200_000, currency: "GBP" }, // config-literal-ok: a provider-event fixture; 03 §5.2 types the currency as this literal
    at: "2026-03-01T09:00:00.000Z",
  };

  const raw = (signature: string) => ({
    rawBody: JSON.stringify(event),
    signature,
    receivedAt: "2026-03-01T09:00:00.000Z" as never,
  });

  it("accepts a correctly signed event", () => {
    expect(provider.parseEvent(raw(SECRET)).ok).toBe(true);
  });

  it("refuses a wrong signature, an empty one, and a body that is not the schema", () => {
    expect(provider.parseEvent(raw("wrong")).ok).toBe(false);
    expect(provider.parseEvent(raw("")).ok).toBe(false);
    expect(
      provider.parseEvent({
        rawBody: "{not json",
        signature: SECRET,
        receivedAt: "2026-03-01T09:00:00.000Z" as never,
      }).ok,
    ).toBe(false);
  });

  it("refuses everything when the configured secret is blank — an empty secret is not a secret", () => {
    const blank = stubStripe({
      eventSecret: "   ",
      environment: "preview",
      appUrl: "https://app",
    });
    expect(blank.parseEvent(raw("   ")).ok).toBe(false);
    expect(blank.parseEvent(raw("")).ok).toBe(false);
  });

  it("names no provider secret in its refusal", () => {
    const refused = provider.parseEvent(raw("wrong"));
    expect(JSON.stringify(refused)).not.toContain(SECRET);
  });
});

describe("the stub takes no money", () => {
  const provider = stubStripe({
    eventSecret: SECRET,
    environment: "preview",
    appUrl: "https://app",
  });

  it("hands back in-app URLs keyed by the LinkRef payments minted, never a provider URL", async () => {
    const link = await provider.createPaymentLink(
      "cus" as never,
      { pence: 15_000, currency: "GBP" }, // config-literal-ok: the amount payments computed and handed the provider, not a config read
      "deposit",
      { kind: "upfront" },
      "ref-1" as never,
      "2026-04-01T09:00:00.000Z" as never,
    );
    expect(link.ok && link.value.url).toBe(
      "https://app/parent/bundle?ref=ref-1",
    );
  });
});
