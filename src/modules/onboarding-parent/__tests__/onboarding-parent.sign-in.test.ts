// S-X-08 — sign in: one refusal for every failure (07 §4), the gate's `next=` honoured only when safe, and the
// anonymous passwordless catch (ADR-042 / D4; 04 §6.1) pinned as failing until `auth` has a method for it.
import { beforeEach, describe, expect, it } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import type { Email } from "@/modules/shared-types";
import { signInAction } from "../actions/sign-in-action";

const formDataOf = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const PARENT = {
  id: "p-1",
  email: "ada@example.test" as Email,
  password: "correct horse battery staple",
  role: "parent" as const,
};
const PASSWORDLESS = {
  id: "p-2",
  email: "nopass@example.test" as Email,
  role: "parent" as const,
};

beforeEach(() => {
  configureAuth(stubAuth({ users: [PARENT, PASSWORDLESS] }));
});

describe("onboarding-parent — signInAction (S-X-08)", () => {
  it("signs a parent in and sends her to her own dashboard", async () => {
    const result = await signInAction(
      null,
      formDataOf({ email: PARENT.email, password: PARENT.password }),
    );
    expect(result).toEqual({ ok: true, value: { destination: "/parent" } });
  });

  it("honours a safe next= and ignores an unsafe one (01 §4d step 2)", async () => {
    const safe = await signInAction(
      null,
      formDataOf({
        email: PARENT.email,
        password: PARENT.password,
        next: "/parent/call",
      }),
    );
    expect(safe.ok && safe.value.destination).toBe("/parent/call");
    const unsafe = await signInAction(
      null,
      formDataOf({
        email: PARENT.email,
        password: PARENT.password,
        next: "https://evil.example",
      }),
    );
    expect(unsafe.ok && unsafe.value.destination).toBe("/parent");
  });

  it("refuses a wrong password and an unknown email with the same line, no provider text", async () => {
    const wrong = await signInAction(
      null,
      formDataOf({ email: PARENT.email, password: "wrong password here" }),
    );
    const unknown = await signInAction(
      null,
      formDataOf({ email: "who@example.test", password: "anything at all" }),
    );
    expect(wrong.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    if (wrong.ok || unknown.ok) return;
    expect(wrong.error).toEqual(unknown.error);
    expect(wrong.error.code).toBe("UNAUTHENTICATED");
    expect(JSON.stringify(wrong)).not.toContain("no such account");
  });

  it("refuses an empty form as VALIDATION", async () => {
    const result = await signInAction(null, formDataOf({ email: "x" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
  });

  it.fails(
    "PINNED (04 §6.1 S-X-08; ADR-042; auth README gap): a known passwordless email is routed to set-password, never refused",
    async () => {
      const result = await signInAction(
        null,
        formDataOf({ email: PASSWORDLESS.email, password: "" }),
      );
      expect(result.ok && result.value.destination).toBe("/set-password");
    },
  );
});
