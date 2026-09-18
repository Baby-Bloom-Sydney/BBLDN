// The media consent gate, re-based (FATE `07.71`; L-009 `3g`).
//
// **Why this suite changed rather than being extended.** The Sydney one asserted three behaviours the re-base
// deliberately removes, and per CLAUDE.md §3 rule 2 a test is never bent to the code — so each is replaced by
// the case for the behaviour that supersedes it, with the reason stated:
//
//   · *"age >= 15: not_required + allowed (COPC age floor)"* — the OAIC Children's Online Privacy Code is
//     Australian and has no force in England and Wales; the fate table already records that it "needs its UK
//     equivalent" as research. It is removed rather than translated (guessing a UK age would be inventing a
//     legal threshold), so the gate now requires consent for **every** child — the conservative direction.
//   · *"falls back to age_months_approx"* — with no age cliff there is no age to compute, and the gate no
//     longer reads the child at all.
//   · the implicit "a test run bypasses the gate" — the `NODE_ENV === "test"` early return is gone, so these
//     cases exercise the same code path production does.
//
// What stays, because it was right: the newest row wins, a decline closes the gate, the TTL has a
// nearing-expiry window for `3b`'s modal, and rows for another child or another purpose are not this child's.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CONSENT } from "@/modules/config";
import {
  hasChildConsent,
  hasParentMediaConsent,
  NANNY_ATTESTATION_PURPOSE,
  PARENT_APP_CONSENT_PURPOSE,
  type MediaConsentGateDeps,
} from "./media-consent-gate";

const NOW = new Date("2026-06-01T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_DAYS = CONSENT.renewalCheckMonths * 30;
const CHILD = "child-1";
const OTHER_CHILD = "child-2";
const PARENT = "parent-1";

interface ConsentRow {
  user_id: string;
  purpose: string;
  related_entity_id: string;
  consent_given: boolean;
  created_at: string;
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function row(overrides: Partial<ConsentRow> = {}): ConsentRow {
  return {
    user_id: PARENT,
    purpose: PARENT_APP_CONSENT_PURPOSE,
    related_entity_id: CHILD,
    consent_given: true,
    created_at: daysAgo(1),
    ...overrides,
  };
}

/** Minimal Supabase fake — just the chain shapes the gate uses, and it throws on any other table. */
function createFakeAdmin(
  consents: ConsentRow[],
): MediaConsentGateDeps["admin"] {
  return {
    from(table: string) {
      if (table !== "consent_records")
        throw new Error(`fake admin: unhandled table ${table}`);
      const filters: Array<(r: ConsentRow) => boolean> = [];
      const builder = {
        eq(field: keyof ConsentRow, value: unknown) {
          filters.push((r) => r[field] === value);
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        async maybeSingle<T>() {
          const top =
            consents
              .filter((r) => filters.every((f) => f(r)))
              .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ??
            null;
          return { data: top as unknown as T | null, error: null };
        },
      };
      return { select: () => builder };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const gate = (consents: ConsentRow[], now: Date = NOW) =>
  hasParentMediaConsent(
    { childId: CHILD },
    { admin: createFakeAdmin(consents), now },
  );

beforeEach(() => vi.clearAllMocks());

describe("media consent gate — consent is required for every child (L-009 `3g`)", () => {
  it("★ blocks when nothing has been recorded — there is no age at which it stops asking", async () => {
    expect(await gate([])).toEqual({ allowed: false, state: "never_given" });
  });

  it("★ does not read the child at all: no DOB is fetched to answer a consent question", async () => {
    // The fake throws on any table but `consent_records`, so a gate that still looked up a child's date of
    // birth would fail here rather than quietly processing a field it has no stated purpose for.
    await expect(gate([row()])).resolves.toMatchObject({ allowed: true });
  });
});

describe("media consent gate — the TTL", () => {
  it("allows a consent given today", async () => {
    expect(await gate([row({ created_at: daysAgo(0) })])).toMatchObject({
      allowed: true,
      state: "active",
    });
  });

  it("allows a consent most of the way through the window", async () => {
    expect(
      await gate([row({ created_at: daysAgo(TTL_DAYS - 60) })]),
    ).toMatchObject({ allowed: true, state: "active" });
  });

  it("★ flags nearing_expiry inside the notice window, and still allows the write", async () => {
    expect(
      await gate([
        row({ created_at: daysAgo(TTL_DAYS - CONSENT.renewalNoticeDays + 1) }),
      ]),
    ).toMatchObject({ allowed: true, state: "nearing_expiry" });
  });

  it("blocks once the window has passed", async () => {
    expect(
      await gate([row({ created_at: daysAgo(TTL_DAYS + 1) })]),
    ).toMatchObject({ allowed: false, state: "expired" });
  });

  it("★ takes the TTL from config, not from a literal — one cadence with the renewal sweep", () => {
    expect(CONSENT.renewalCheckMonths).toBe(12);
    expect(CONSENT.renewalNoticeDays).toBe(7);
  });
});

describe("media consent gate — which row answers", () => {
  it("★ a decline closes the gate, and the consent before it is not resurrected", async () => {
    expect(
      await gate([
        row({ created_at: daysAgo(30) }),
        row({ created_at: daysAgo(1), consent_given: false }),
      ]),
    ).toMatchObject({ allowed: false, state: "revoked" });
  });

  it("uses the most recent row when several exist", async () => {
    expect(
      await gate([
        row({ created_at: daysAgo(TTL_DAYS + 10) }),
        row({ created_at: daysAgo(2) }),
      ]),
    ).toMatchObject({ allowed: true, state: "active" });
  });

  it("★ keys on the registry PURPOSE — the nanny's attestation is not the parent's consent", async () => {
    expect(await gate([row({ purpose: NANNY_ATTESTATION_PURPOSE })])).toEqual({
      allowed: false,
      state: "never_given",
    });
  });

  it("ignores a consent recorded for another child", async () => {
    expect(await gate([row({ related_entity_id: OTHER_CHILD })])).toEqual({
      allowed: false,
      state: "never_given",
    });
  });

  it("names who consented, so the surface can say whose permission it has", async () => {
    expect((await gate([row({ user_id: "parent-9" })])).consentingUserId).toBe(
      "parent-9",
    );
  });
});

describe("media consent gate — the nanny's half uses the same rule", () => {
  it("reads the nanny attestation for this child on the same TTL", async () => {
    const admin = createFakeAdmin([
      row({ purpose: NANNY_ATTESTATION_PURPOSE, created_at: daysAgo(1) }),
    ]);

    const result = await hasChildConsent(
      { childId: CHILD, purpose: NANNY_ATTESTATION_PURPOSE },
      { admin, now: NOW },
    );

    expect(result).toMatchObject({ allowed: true, state: "active" });
  });
});
