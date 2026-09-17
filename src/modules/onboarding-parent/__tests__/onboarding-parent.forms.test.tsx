// The screens: the promise line sits above the button (04 §3.1 step 5), the UK mobile field carries `tel`
// semantics (fix a11y-12), the AGR-01 tick links the two documents from props, a failure is an alert naming the
// field, and success follows the destination the action returned. `react-dom@18` has no `useFormState` outside
// Next's bundled canary (same precedent as auth.set-password / public-site.contact), so the hooks are mocked.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE } from "@/modules/config";
import { SENDERS } from "@/modules/config/server";
import type {
  ParentSignupAction,
  PasswordResetRequestAction,
  SignInAction,
} from "../types";
import { ParentSignupForm } from "../components/ParentSignupForm";
import { SignInForm } from "../components/SignInForm";
import { ForgotPasswordForm } from "../components/ForgotPasswordForm";
import { AuthShell } from "../components/AuthShell";
import { SIGNUP_COPY } from "../lib/signup-copy";

const formHooks = vi.hoisted(() => ({ state: null as unknown }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormState: () => [formHooks.state, async () => undefined],
  useFormStatus: () => ({ pending: false }),
}));

const assign = vi.fn();
beforeEach(() => {
  formHooks.state = null;
  assign.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign },
  });
});

const noSignup: ParentSignupAction = async () => ({
  ok: true,
  value: { destination: "/parent", positionOpened: false },
});
const noSignIn: SignInAction = async () => ({
  ok: true,
  value: { destination: "/parent" },
});
const noReset: PasswordResetRequestAction = async () => ({
  ok: true,
  value: undefined,
});

const signup = (extra: Partial<Parameters<typeof ParentSignupForm>[0]> = {}) =>
  render(
    <ParentSignupForm
      action={noSignup}
      variant="cold"
      context={{ source: "cold" }}
      minPasswordLength={12}
      signInHref="/login"
      clientTermsHref="/legal/client-terms"
      privacyHref="/legal/privacy-policy"
      {...extra}
    />,
  );

describe("onboarding-parent — ParentSignupForm (S-X-05 / S-X-06)", () => {
  it("shows the promise line above the button, the UK mobile field and the AGR-01 tick", () => {
    signup();
    const promise = screen.getByText(SIGNUP_COPY.promiseLine);
    const button = screen.getByRole("button", { name: "Create my account" });
    expect(
      promise.compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const mobile = screen.getByLabelText("UK mobile");
    expect(mobile).toHaveAttribute("inputmode", "tel");
    expect(mobile).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "minlength",
      "12",
    );
    expect(screen.getByRole("link", { name: "client terms" })).toHaveAttribute(
      "href",
      "/legal/client-terms",
    );
    expect(
      screen.getByRole("link", { name: "privacy policy" }),
    ).toHaveAttribute("href", "/legal/privacy-policy");
    expect(screen.getByRole("checkbox")).toHaveAttribute("name", "consent");
  });

  it("carries the entry-path context as hidden fields and names the invite", () => {
    const { container } = signup({
      context: { source: "invite", inviteToken: "ABCD-EFGH" },
    });
    expect(
      container.querySelector('input[name="inviteToken"]'),
    ).toHaveAttribute("value", "ABCD-EFGH");
    expect(container.querySelector('input[name="source"]')).toHaveAttribute(
      "value",
      "invite",
    );
    expect(screen.getByText(/You've been invited/)).toBeInTheDocument();
  });

  it("shows the match count beside the matches (S-X-05)", () => {
    signup({ variant: "beside-matches", matchCount: 7 });
    expect(screen.getByText(/7 nannies matched/)).toBeInTheDocument();
  });

  it("announces a failure and marks the named field invalid", () => {
    formHooks.state = {
      ok: false,
      error: {
        code: "VALIDATION",
        message: `Please enter a UK mobile number, starting 07 or ${LOCALE.phonePrefix} 7.`,
        details: { reason: "invalid-input", field: "mobile" },
      },
    };
    signup();
    expect(screen.getByRole("alert")).toHaveTextContent("UK mobile number");
    expect(screen.getByLabelText("UK mobile")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("shows the generic line for an INTERNAL refusal beside the standing sign-in link, and follows the destination on success", () => {
    formHooks.state = {
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong on our side." },
    };
    const first = signup();
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    first.unmount();
    formHooks.state = {
      ok: true,
      value: { destination: "/parent/call", positionOpened: true },
    };
    signup();
    expect(assign).toHaveBeenCalledWith("/parent/call");
  });
});

describe("onboarding-parent — SignInForm (S-X-08)", () => {
  it("refuses with one reassuring line that points at S-X-09", () => {
    formHooks.state = {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "That email and password don't match.",
        details: { reason: "refused" },
      },
    };
    render(
      <SignInForm
        action={noSignIn}
        nextPath="/parent/call"
        forgotPasswordHref="/forgot-password"
        signupHref="/signup"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("don't match");
    expect(
      screen.getByRole("link", { name: "Email me a link" }),
    ).toHaveAttribute("href", "/forgot-password");
    expect(screen.getByDisplayValue("/parent/call")).toHaveAttribute(
      "name",
      "next",
    );
  });
});

describe("onboarding-parent — ForgotPasswordForm (S-X-09)", () => {
  it("shows the support mailbox when the email cannot be sent, and one sent state", () => {
    formHooks.state = {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "We can't send that email just yet.",
      },
    };
    const first = render(
      <ForgotPasswordForm
        action={noReset}
        signInHref="/login"
        supportEmail={SENDERS.support.address}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      SENDERS.support.address,
    );
    first.unmount();
    formHooks.state = { ok: true, value: undefined };
    render(
      <ForgotPasswordForm
        action={noReset}
        signInHref="/login"
        supportEmail={SENDERS.support.address}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Check your email");
  });
});

describe("onboarding-parent — AuthShell", () => {
  it("renders the brand from props and the two legal links", () => {
    render(
      <AuthShell
        brandName="BrandFromConfig"
        homeHref="/"
        clientTermsHref="/legal/client-terms"
        privacyHref="/legal/privacy-policy"
      >
        <p>child</p>
      </AuthShell>,
    );
    expect(
      screen.getByRole("link", { name: "BrandFromConfig" }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("navigation", { name: "Legal" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("child");
  });
});
