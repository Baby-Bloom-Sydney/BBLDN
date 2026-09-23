// 03 §8.2 row 40 — the public contact form's message, to the support inbox, `replyTo` the submitter
// (`public-site/actions/send-contact-message-action.ts` sets both). `08.17`.
//
// **Every field here came from an anonymous POST**, so every one is escaped before it reaches the HTML body
// (`escape-html.ts`). `audience: 'support'`: the reader is the operator, not a parent.
import type { EmailTemplate } from "../types";
import { escapeHtml } from "./lib/escape-html";
import { emailLayout } from "./lib/email-layout";

type ContactData = {
  readonly name?: unknown;
  readonly email?: unknown;
  readonly role?: unknown;
  readonly message?: unknown;
};

const nameOf = (data: ContactData) => String(data.name ?? "someone");

const blocks = (data: ContactData) => {
  const line = `${nameOf(data)} (${String(data.role ?? "unknown")}) — ${String(data.email ?? "")}`;
  return {
    heading: "New contact message",
    paragraphs: [escapeHtml(line), escapeHtml(data.message)],
    textParagraphs: [line, String(data.message ?? "")],
  };
};

export const contactRequestPublicTemplate: EmailTemplate<"contact-request-public"> =
  Object.freeze({
    id: "contact-request-public",
    channel: "email",
    from: "noreply",
    audience: "support",
    subject: (data) => `Contact form: ${nameOf(data)}`,
    html: (data) => emailLayout(blocks(data)).html,
    text: (data) => emailLayout(blocks(data)).text,
  });
