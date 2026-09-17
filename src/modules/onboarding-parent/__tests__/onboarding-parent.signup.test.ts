// S-X-05 / S-X-06 — the signup action: validated once at the boundary, the role always `parent`, a refusal that
// never leaks provider text, the profile row written through the store `0017` made possible (ADR-131), and —
// pinned as failing until the P-2 slice exists (ADR-120 rule 2) — the outcome the code cannot yet deliver.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auth, configureAuth, stubAuth } from "@/modules/auth";
import { LOCALE, SECURITY } from "@/modules/config";
import {
  configureConsent,
  configureEvents,
  configureUnitOfWork,
  createConsent,
  createEvents,
  createUnitOfWork,
  log,
  memoryConsentStore,
  memoryEventLogStore,
  memoryTransactionOpener,
  memoryRateLimitStore,
  configureRateLimiter,
  createRateLimiter,
  err,
  ok,
} from "@/modules/platform";
import { configureMatching, stubMatching } from "@/modules/matching";
import {
  configurePositions,
  createPositions,
  createPositionsSlice,
  memoryPositionStore,
  registerPositionsSlice,
  registerSlice,
} from "@/modules/positions";
import type { Instant, LeadId } from "@/modules/shared-types";
import { configureParentProfileStore } from "../lib/configure-parent-profile-store";
import { memoryParentProfileStore } from "../lib/memory-parent-profile-store";
import { PARENT_PROFILE_STORE_REGISTRY } from "../lib/parent-profile-store-registry";
import { signUpParentAction } from "../actions/sign-up-parent-action";

const formDataOf = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const PASSWORD = "a".repeat(SECURITY.password.minLength);
const VALID = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.test",
  mobile: "07700 900123",
  password: PASSWORD,
  confirmPassword: PASSWORD,
  consent: "on",
  source: "cold",
};
const LEAD = "6f1d2c3b-4a5e-4f60-9b71-8c2d3e4f5a6b";

let consents: ReturnType<typeof memoryConsentStore>;

/** The module's own fail-closed default, captured before any test installs a store: the registry is
 *  module-level, so without restoring it here one describe's `configureParentProfileStore` would decide
 *  what the next one is testing. */
const UNCONFIGURED_PROFILE_STORE = PARENT_PROFILE_STORE_REGISTRY.get();

/** REVIEW-2: signup now consumes 07 §8 row 2's per-address budget, and the limiter is module state. Without a
 *  fresh one per spec the fourth test in this file would be refused by the third test's attempts. */
const freshLimiter = (): void => {
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
  );
};

beforeEach(() => {
  freshLimiter();
  PARENT_PROFILE_STORE_REGISTRY.set(UNCONFIGURED_PROFILE_STORE);
  configureAuth(stubAuth());
  consents = memoryConsentStore();
  configureConsent(
    createConsent({
      store: consents,
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    }),
  );
});

describe("onboarding-parent — signUpParentAction once a profile store is installed", () => {
  // Was `it.fails` with "migration owed": `0017`'s `create_parent_profile` is that migration, and
  // `src/boot/wire-parent-profile-store.ts` installs the adapter over it. The pin asked for the wrong
  // thing — it asked the *unconfigured* default to write a row, which would be the fail-closed hole
  // `parent-profile-store-registry.ts` exists to prevent — so what it was actually pinning is asserted
  // here instead: with a store bound, the signup completes **and a profile row exists behind it**.
  // 02 §4.1: "exactly one `user_roles` + one `user_profiles` row per user, created in the signup action".
  it("writes the profile row and completes (02 §4.1; 0017 create_parent_profile)", async () => {
    const profiles = memoryParentProfileStore();
    configureParentProfileStore(profiles);

    const result = await signUpParentAction(null, formDataOf(VALID));

    expect(result.ok).toBe(true);
    expect(profiles.rows()).toHaveLength(1);
    expect(profiles.rows()[0]).toMatchObject({
      firstName: VALID.firstName,
      lastName: VALID.lastName,
    });
  });
});

describe("onboarding-parent — signUpParentAction while the profile store is unconfigured", () => {
  it("fails closed, never throws, and keeps the reason server-side (01 §4a)", async () => {
    const result = await signUpParentAction(null, formDataOf(VALID));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL");
    expect(result.error.details).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(
      "profile-store-not-configured",
    );
  });
});

describe("onboarding-parent — signUpParentAction (validation at the boundary, 01 §4a)", () => {
  it.each([
    [{ mobile: "0412 345 678" }, "mobile"],
    [{ confirmPassword: "different-password!" }, "confirmPassword"],
    [{ consent: "" }, "consent"],
    [{ email: "not-an-email" }, "email"],
    [{ password: "short", confirmPassword: "short" }, "password"],
    [{ firstName: " " }, "firstName"],
  ])("refuses %j with a VALIDATION naming %s", async (patch, field) => {
    const result = await signUpParentAction(
      null,
      formDataOf({ ...VALID, ...patch }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
    expect(result.error.details).toEqual({ reason: "invalid-input", field });
  });

  it("never creates the account when a field is invalid", async () => {
    await signUpParentAction(null, formDataOf({ ...VALID, mobile: "no" }));
    const signedIn = await auth.signIn({
      email: VALID.email as never,
      password: PASSWORD,
    });
    expect(signedIn.ok).toBe(false);
  });
});

describe("onboarding-parent — signUpParentAction with the profile store configured", () => {
  let profiles: ReturnType<typeof memoryParentProfileStore>;

  beforeEach(() => {
    profiles = memoryParentProfileStore();
    configureParentProfileStore(profiles);
  });

  it("creates a parent (never admin), the AGR-01 rows and the profile with the E.164 mobile, then routes to S-P-03", async () => {
    const result = await signUpParentAction(null, formDataOf(VALID));
    expect(result).toEqual({
      ok: true,
      value: { destination: "/parent", positionOpened: false },
    });
    const session = await auth.getSession();
    expect(session.ok && session.value?.role).toBe("parent");
    expect(profiles.rows()).toEqual([
      expect.objectContaining({
        firstName: "Ada",
        lastName: "Lovelace",
        mobile: `${LOCALE.phonePrefix}7700900123`,
      }),
    ]);
    expect(consents.consents.map((row) => row.purpose).sort()).toEqual([
      "client-tos",
      "privacy-policy",
    ]);
    expect(consents.consents.every((row) => row.agreementId === "AGR-01")).toBe(
      true,
    );
  });

  it("routes an invite arrival to S-P-14 and a profile signup to S-P-03 with the nanny (03.36)", async () => {
    const invited = await signUpParentAction(
      null,
      formDataOf({ ...VALID, source: "invite", inviteToken: "ABCD-EFGH" }),
    );
    expect(invited.ok && invited.value.destination).toBe(
      "/invite/connect/ABCD-EFGH",
    );
    const fromProfile = await signUpParentAction(
      null,
      formDataOf({
        ...VALID,
        email: "b@example.test",
        source: "profile",
        nannyId: LEAD,
      }),
    );
    expect(fromProfile.ok && fromProfile.value.destination).toBe(
      `/parent?nanny=${LEAD}`,
    );
  });

  it("refuses a duplicate email with the generic line and no provider text", async () => {
    await signUpParentAction(null, formDataOf(VALID));
    const again = await signUpParentAction(null, formDataOf(VALID));
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe("INTERNAL");
    expect(JSON.stringify(again)).not.toContain("already exists");
  });

  // `1c`'s pin (5) — "a duplicate is a VALIDATION naming the email" — was DELETED here (P1-STORES), not built.
  // ADR-132 and ADR-137 ruled that routing or labelling a taken address differently is itself the enumeration
  // oracle 07 §4 forbids, so the pin asked for a defect; the claim above it (one generic line, no provider text)
  // is what the document now wants, and it passes. Recorded rather than quietly dropped.

  it("keeps the account and lands on S-P-03 state 0 when P-2 refuses (no slice registered)", async () => {
    const result = await signUpParentAction(
      null,
      formDataOf({ ...VALID, source: "advanced_match", leadId: LEAD }),
    );
    expect(result).toEqual({
      ok: true,
      value: { destination: "/parent", positionOpened: false },
    });
    expect(profiles.rows()).toHaveLength(1);
  });

  it("exposes the registry as a Registry (boot wiring reaches the binding)", () => {
    expect(PARENT_PROFILE_STORE_REGISTRY.get()).toBe(profiles);
  });
});

/**
 * `1e` — the pin `1c` left here, flipped. 04 §3.1 steps 5–6 (path B): one submit creates the account **and** the
 * position, P-2's own cascade opens the call, and the parent lands on S-P-01. It needs the whole spine wired,
 * which is exactly why `1c` could not assert it: the stage model, the P-row slice, a call slice to receive C-a,
 * and the lead the wizard saved.
 */
describe("onboarding-parent — the one-go signup with a lead (04 §3.1 steps 5–6, path B)", () => {
  const AREA = { area: "Islington", district: "N1" };

  beforeEach(() => {
    configureUnitOfWork(createUnitOfWork(memoryTransactionOpener()));
    configureEvents(createEvents({ store: memoryEventLogStore(), log }));
    configureParentProfileStore(memoryParentProfileStore());
    configureMatching(
      stubMatching({
        leadRows: [
          {
            id: LEAD as LeadId,
            answers: {
              area: AREA,
              children: [{ ageLabel: "1–2 years" }],
              days: [0],
              parts: ["morning"],
              scheduleType: "Fixed",
            },
            area: AREA,
            source: "adv",
            completed: true,
          },
        ],
      }),
    );
    const store = memoryPositionStore();
    registerPositionsSlice(
      createPositionsSlice({ store, isInServiceArea: async () => true }),
    );
    registerSlice({
      entity: "call",
      handlers: [
        {
          id: "C-a",
          run: async (input) =>
            ok({
              entity: input.entity,
              stage: "awaiting-slot" as const,
              version: 1,
              changedAt: "2026-01-09T08:00:00.000Z" as Instant,
              cascaded: [],
              events: [],
            }),
        },
      ],
    });
    configurePositions(createPositions({ store }));
  });

  it("opens the position and lands on S-P-01", async () => {
    const result = await signUpParentAction(
      null,
      formDataOf({ ...VALID, source: "advanced_match", leadId: LEAD }),
    );
    expect(result.ok && result.value).toEqual({
      destination: "/parent/call",
      positionOpened: true,
    });
  });

  it("keeps the account and routes to S-P-03 state 0 when the lead has no London area", async () => {
    configureMatching(
      stubMatching({
        leadRows: [
          {
            id: LEAD as LeadId,
            answers: {},
            area: null,
            source: null,
            completed: false,
          },
        ],
      }),
    );
    const result = await signUpParentAction(
      null,
      formDataOf({ ...VALID, source: "advanced_match", leadId: LEAD }),
    );
    expect(result.ok && result.value).toEqual({
      destination: "/parent",
      positionOpened: false,
    });
  });
});

// ── REVIEW-2 (security HIGH-3) — 07 §8 row 2's limit on signup ────────────────────────────────────────────
//
// Written RED first against the shipped action, which ran `auth.signUp` -> consent rows -> profile row ->
// welcome email with no ceiling on an anonymous `"use server"` POST. `SECURITY.rateLimits.signupPerEmail` was
// declared in config with zero call sites. Both cases failed before the fix.
/** A full `RateLimitAllowance`, so a hand-written limiter satisfies the port rather than a cast. */
const allowed = () =>
  ok({
    remaining: 1,
    resetAt: new Date(Date.now() + 60_000).toISOString() as Instant,
  });

describe("onboarding-parent — signup is rate limited (07 §8 row 2; REVIEW-2)", () => {
  const OTHER = { ...VALID, email: "grace@example.test" };

  beforeEach(() => {
    configureParentProfileStore(memoryParentProfileStore());
  });

  it("writes nothing at all once the address's budget is spent — no account, no consent row", async () => {
    configureRateLimiter(
      { consume: async () => err("RATE_LIMITED", "Too many") },
      "shared",
    );
    const answer = await signUpParentAction(null, formDataOf(VALID));
    expect(answer.ok).toBe(false);
    // The limit is taken ahead of every write, so the AGR-01 rows the happy path asserts are simply absent.
    expect(consents.consents).toEqual([]);
  });

  it("refuses with the form's own generic line, never a different one (ADR-132)", async () => {
    configureRateLimiter(
      { consume: async () => err("RATE_LIMITED", "Too many") },
      "shared",
    );
    const throttled = await signUpParentAction(null, formDataOf(VALID));
    expect(throttled.ok).toBe(false);
    if (throttled.ok) return;
    // `toActionResult` collapses every INTERNAL to one fixed client sentence (01 §4a), which is exactly the
    // property ADR-132 wants: the caller reads the same words for a throttle, an outage and a taken address.
    expect(throttled.error.code).toBe("INTERNAL");
    expect(throttled.error.message).not.toMatch(
      /already|taken|exists|limit|many|rate/i,
    );
    expect(throttled.error.message).not.toContain(VALID.email);
  });

  it("fails CLOSED when the limiter cannot answer (ADR-134)", async () => {
    configureRateLimiter(
      { consume: async () => err("INTERNAL", "Rate limit unavailable") },
      "shared",
    );
    const answer = await signUpParentAction(null, formDataOf(VALID));
    expect(answer.ok).toBe(false);
    expect(consents.consents).toEqual([]);
  });

  it("buckets per address — one address's spent budget does not refuse another's first signup", async () => {
    const spent = new Set<string>();
    configureRateLimiter(
      {
        consume: async (key: string) => {
          if (spent.has(key)) return err("RATE_LIMITED", "Too many");
          spent.add(key);
          return allowed();
        },
      },
      "shared",
    );
    const first = await signUpParentAction(null, formDataOf(VALID));
    const again = await signUpParentAction(null, formDataOf(VALID));
    const other = await signUpParentAction(null, formDataOf(OTHER));
    expect(first.ok).toBe(true);
    expect(again.ok).toBe(false);
    // A different address hashes to a different key, so it still gets its own first attempt.
    expect(other.ok).toBe(true);
  });
});
