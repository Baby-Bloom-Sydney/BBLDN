// S-X-09's set-password variant (ADR-042; AC-X-14/15): the action's boundary validation and the component's
// three states (04 §6 "States"). The point of the screen is that it is **not** an error — a person who never had
// a password has done nothing wrong — so the idle state carries no error styling and no alert.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SetPasswordForm } from "../components/SetPasswordForm";
import type { ClientResult } from "@/modules/platform";

const noop = async (): Promise<ClientResult<void>> => ({
  ok: true,
  value: undefined,
});

// One hoisted stub for the React 18 form hooks, so each spec can render a state without re-importing the module.
const formHooks = vi.hoisted(() => ({ state: null as unknown }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useFormState: () => [formHooks.state, async () => undefined],
  useFormStatus: () => ({ pending: false }),
}));

describe("setPasswordAction (01 §4a — validate once, at the boundary)", () => {
  it("refuses a form with no password field without reaching auth", async () => {
    vi.resetModules();
    const setPassword = vi.fn();
    vi.doMock("../lib/default-auth", () => ({ auth: { setPassword } }));
    const { setPasswordAction } =
      await import("../actions/set-password-action");
    const result = await setPasswordAction(null, new FormData());
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("VALIDATION");
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("delegates a present password to auth.setPassword and serialises the result", async () => {
    vi.resetModules();
    const setPassword = vi.fn(async () => ({ ok: true, value: undefined }));
    vi.doMock("../lib/default-auth", () => ({ auth: { setPassword } }));
    const { setPasswordAction } =
      await import("../actions/set-password-action");
    const form = new FormData();
    form.set("password", "a-long-enough-password");
    const result = await setPasswordAction(null, form);
    expect(setPassword).toHaveBeenCalledWith("a-long-enough-password");
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("passes a failure back with no `cause` attached (01 §4a serialisable)", async () => {
    vi.resetModules();
    vi.doMock("../lib/default-auth", () => ({
      auth: {
        setPassword: async () => ({
          ok: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Please sign in to continue.",
            cause: new Error("secret internals"),
          },
        }),
      },
    }));
    const { setPasswordAction } =
      await import("../actions/set-password-action");
    const form = new FormData();
    form.set("password", "a-long-enough-password");
    const result = await setPasswordAction(null, form);
    expect(result.ok).toBe(false);
    expect(result.ok === false && "cause" in result.error).toBe(false);
  });
});

describe("SetPasswordForm states (04 §6)", () => {
  it("idle: reads as a next step, not an error", () => {
    formHooks.state = null;
    render(
      <SetPasswordForm action={noop} minLength={12} signInHref="/login" />,
    );
    expect(
      screen.getByRole("heading", { name: /set your password/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute(
      "minlength",
      "12",
    );
    expect(screen.getByLabelText(/new password/i)).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("failed: announces the policy in an alert and marks the field invalid", () => {
    formHooks.state = {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Your password needs to be at least 12 characters.",
      },
    };
    render(
      <SetPasswordForm action={noop} minLength={12} signInHref="/login" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/at least 12/i);
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute(
      "aria-invalid",
    );
  });

  it("done: offers the way back to sign in (AC-X-15)", () => {
    formHooks.state = { ok: true, value: undefined };
    render(
      <SetPasswordForm action={noop} minLength={12} signInHref="/login" />,
    );
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
