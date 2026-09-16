// S-X-23: the action validates once at the boundary (01 §4a), sends through `comms`, and **fails closed as a
// `ClientResult`** while `comms` is unconfigured (ADR-120 rule 1 — the merge claim ships as a test); the form
// shows the support mailbox on failure and the sent state on success.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SENDERS } from "@/modules/config/server";
import type { ContactMessageAction } from "../types";
import { ContactForm } from "../components/ContactForm";
import { sendContactMessageAction } from "../actions/send-contact-message-action";

// `react-dom@18` has no `useFormState` outside Next's bundled canary (same precedent as auth.set-password).
const formHooks = vi.hoisted(() => ({ state: null as unknown }));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormState: () => [formHooks.state, async () => undefined],
  useFormStatus: () => ({ pending: false }),
}));

beforeEach(() => {
  formHooks.state = null;
});

const formDataOf = (fields: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const VALID = {
  name: "Ada",
  email: "ada@example.test",
  role: "parent",
  message: "We are looking for a nanny three days a week.",
};

describe("public-site — sendContactMessageAction", () => {
  it("refuses an invalid submission with a VALIDATION result naming the field", async () => {
    const result = await sendContactMessageAction(
      null,
      formDataOf({ ...VALID, email: "not-an-email" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION");
    expect(result.error.details).toEqual(
      expect.objectContaining({ reason: "invalid-input", field: "email" }),
    );
  });

  it("fails closed, never throws, while comms is unconfigured", async () => {
    const result = await sendContactMessageAction(null, formDataOf(VALID));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL");
    expect(JSON.stringify(result)).not.toContain("comms-not-configured");
  });
});

const noop: ContactMessageAction = async () => ({ ok: true, value: undefined });

describe("public-site — ContactForm", () => {
  it("shows the failure with the support mailbox from config", () => {
    formHooks.state = {
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong." },
    };
    render(
      <ContactForm action={noop} supportEmail={SENDERS.support.address} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong.",
    );
    expect(
      screen.getByRole("link", { name: SENDERS.support.address }),
    ).toHaveAttribute("href", `mailto:${SENDERS.support.address}`);
  });

  it("renders the form with its submit button before any submission", () => {
    render(<ContactForm action={noop} supportEmail="x@example.test" />);
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    expect(screen.getByLabelText("Email to reply to")).toHaveAttribute(
      "name",
      "email",
    );
  });

  it("replaces the form with the sent state on success", () => {
    formHooks.state = { ok: true, value: undefined };
    render(<ContactForm action={noop} supportEmail="x@example.test" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Thank you — we have it.",
    );
    expect(screen.queryByRole("button", { name: "Send message" })).toBeNull();
  });
});
