// S-N-18 — the ten-step profile completion: each step's fields reach `update_nanny_profile()` through the store
// under the caller's session, the action answers the next step, the last step answers `null`, and the
// completeness the database computed is what the client sees (ADR-152 (2); `03.18`). RED first.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { LOCALE, SECURITY } from "@/modules/config";
import {
  configureRateLimiter,
  createRateLimiter,
  memoryRateLimitStore,
} from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import { cookieJarModule, resetJar } from "./cookie-jar";
import { configureNannyAccountStore } from "../lib/configure-nanny-account-store";
import { memoryNannyAccountStore } from "../lib/memory-nanny-account-store";
import { PROFILE_STEPS } from "../lib/profile-steps";
import { saveNannyProfileStepAction } from "../actions/save-nanny-profile-step-action";
import { loadNannyProfile } from "../lib/load-nanny-profile";

vi.mock("next/headers", () => cookieJarModule());

const formDataOf = (
  fields: Record<string, string | ReadonlyArray<string>>,
): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") data.set(key, value);
    else for (const item of value) data.append(key, item);
  }
  return data;
};

const NANNY = "22222222-2222-4222-8222-222222222222";
const users = [
  {
    id: NANNY,
    email: "bea@example.test" as Email,
    password: "x".repeat(12),
    role: "nanny" as const,
  },
];

let accounts: ReturnType<typeof memoryNannyAccountStore>;

beforeEach(async () => {
  resetJar();
  configureRateLimiter(
    createRateLimiter({
      store: memoryRateLimitStore(),
      burstAlertMultiple: SECURITY.burstAlertMultiple,
    }),
  );
  configureAuth(stubAuth({ users, signedInUserId: NANNY }));
  accounts = memoryNannyAccountStore();
  configureNannyAccountStore(accounts);
  await accounts.create({ firstName: "Bea", lastName: "Lin", isolated: true });
});

describe("onboarding-nanny — saveNannyProfileStepAction (S-N-18)", () => {
  it("step 0 saves location + mobile onto the contact half and answers step 1", async () => {
    const result = await saveNannyProfileStepAction(
      null,
      formDataOf({
        step: "0",
        district: "SW4",
        area: "Clapham",
        mobile: "07700 900123",
      }),
    );
    expect(result).toEqual({ ok: true, value: { complete: false, next: 1 } });
    expect(accounts.rows()[0]).toMatchObject({
      district: "SW4",
      area: "Clapham",
      mobile: `${LOCALE.phonePrefix}7700900123`,
    });
  });

  it("walks every step; the last answers null and the completeness comes from the store", async () => {
    const answers: ReadonlyArray<
      Record<string, string | ReadonlyArray<string>>
    > = [
      { district: "SW4", area: "Clapham", mobile: "07700 900123" },
      { dateOfBirth: "1990-04-12" },
      { yearsExperience: "8", ageGroups: ["babies", "toddlers"] },
      { qualification: "level-3" },
      { certificates: ["paediatric-first-aid"] },
      { languages: ["English", "Portuguese"] },
      {
        hasCar: "yes",
        hasDrivingLicence: "yes",
        isNonSmoker: "yes",
        comfortableWithPets: "no",
      },
      {
        availability: JSON.stringify({
          monday: ["morning"],
          friday: ["afternoon"],
        }),
      },
      { hourlyRateMin: "17", availableFrom: "2026-10-01" },
      {
        bio: "Eight years with under-fives across south London; references on request.",
      },
    ];
    expect(answers).toHaveLength(PROFILE_STEPS.length);
    let last: Awaited<ReturnType<typeof saveNannyProfileStepAction>> | null =
      null;
    for (const [index, fields] of answers.entries()) {
      last = await saveNannyProfileStepAction(
        null,
        formDataOf({ step: String(index), ...fields }),
      );
      expect(last.ok, `step ${index}: ${JSON.stringify(last)}`).toBe(true);
    }
    expect(last).toEqual({ ok: true, value: { complete: true, next: null } });
    expect(accounts.rows()[0]).toMatchObject({
      profile: {
        yearsExperience: 8,
        qualification: "level-3",
        certificates: ["paediatric-first-aid"],
        languages: ["English", "Portuguese"],
        hasCar: true,
        comfortableWithPets: false,
        availability: { monday: ["morning"], friday: ["afternoon"] },
        hourlyRateMinPence: 1700, // config-literal-ok: a fixture's own rate, not a PRICES value
        availableFrom: "2026-10-01",
      },
      dateOfBirth: "1990-04-12",
    });
  });

  it("refuses a field with a VALIDATION naming it", async () => {
    const result = await saveNannyProfileStepAction(
      null,
      formDataOf({ step: "0", district: "", mobile: "07700 900123" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({
      reason: "invalid-input",
      field: "district",
    });
  });

  it("a step outside the list is refused, not defaulted", async () => {
    const result = await saveNannyProfileStepAction(
      null,
      formDataOf({ step: "42", bio: "x" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toEqual({
      reason: "invalid-input",
      field: "step",
    });
  });

  it("07 §8 row 16 — over the per-user profile-step limit the write is refused with the generic line (security pass HIGH)", async () => {
    const perMinute = SECURITY.rateLimits.profileSteps.perMinute ?? 0;
    expect(perMinute).toBeGreaterThan(0);
    const step = { step: "1", dateOfBirth: "1990-04-12" };
    for (let i = 0; i < perMinute; i += 1)
      expect(
        (await saveNannyProfileStepAction(null, formDataOf(step))).ok,
      ).toBe(true);
    const over = await saveNannyProfileStepAction(
      null,
      formDataOf({ ...step, dateOfBirth: "1991-01-01" }),
    );
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.error.code).toBe("INTERNAL");
    expect(accounts.rows()[0]?.dateOfBirth).toBe("1990-04-12");
  });

  it("a visitor is refused", async () => {
    configureAuth(stubAuth({ users }));
    const result = await saveNannyProfileStepAction(
      null,
      formDataOf({
        step: "0",
        district: "SW4",
        area: "Clapham",
        mobile: "07700 900123",
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("onboarding-nanny — loadNannyProfile (the S-N-18 / S-N-19 prefill)", () => {
  it("answers the nanny's own rows, and null for a session with no nanny row", async () => {
    const own = await loadNannyProfile();
    expect(own?.firstName).toBe("Bea");
    configureAuth(
      stubAuth({
        users: [{ ...users[0]!, id: "33333333-3333-4333-8333-333333333333" }],
        signedInUserId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    expect(await loadNannyProfile()).toBeNull();
  });
});
