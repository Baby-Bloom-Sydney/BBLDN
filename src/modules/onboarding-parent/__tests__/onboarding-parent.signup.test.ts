// S-X-05 / S-X-06 — the signup action: validated once at the boundary, the role always `parent`, a refusal that
// never leaks provider text, and — pinned as failing until the schema and the P-2 slice exist (ADR-120 rule 2) —
// the two documented outcomes the code cannot yet deliver.
import { beforeEach, describe, expect, it } from "vitest";
import { auth, configureAuth, stubAuth } from "@/modules/auth";
import { LOCALE, SECURITY } from "@/modules/config";
import {
  configureConsent,
  createConsent,
  memoryConsentStore,
} from "@/modules/platform";
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

beforeEach(() => {
  configureAuth(stubAuth());
  consents = memoryConsentStore();
  configureConsent(
    createConsent({
      store: consents,
      cookieExpiryDays: SECURITY.retention.cookieExpiryDays,
    }),
  );
});

describe("onboarding-parent — signUpParentAction while the profile store is unconfigured", () => {
  it.fails(
    "PINNED (02 §4.1; migration owed): the default binding writes the user_profiles row and the signup completes",
    async () => {
      const result = await signUpParentAction(null, formDataOf(VALID));
      expect(result.ok).toBe(true);
    },
  );

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

  it.fails(
    "PINNED (04 §6.1 S-X-05 'duplicate email → S-X-08'; auth.signUp cannot tell a duplicate from an outage): a duplicate is a VALIDATION naming the email",
    async () => {
      await signUpParentAction(null, formDataOf(VALID));
      const again = await signUpParentAction(null, formDataOf(VALID));
      expect(!again.ok && again.error.code).toBe("VALIDATION");
      expect(!again.ok && again.error.details).toEqual({
        reason: "invalid-input",
        field: "email",
      });
    },
  );

  it.fails(
    "PINNED (04 §3.1 step 5–6; 1e owns the P-2 slice): a one-go signup with a lead opens the position and lands on S-P-01",
    async () => {
      const result = await signUpParentAction(
        null,
        formDataOf({ ...VALID, source: "advanced_match", leadId: LEAD }),
      );
      expect(result.ok && result.value).toEqual({
        destination: "/parent/call",
        positionOpened: true,
      });
    },
  );

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
