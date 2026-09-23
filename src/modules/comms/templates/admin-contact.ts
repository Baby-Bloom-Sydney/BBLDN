// 03 §8.2 row 39 — the free-form message an operator sends a user from the admin surface. `08.18`; the `from`
// key rides on the `Message` (`from ∈ SenderKey`, 03 §8.1), so the template's own `from` is the default the
// caller may override rather than a mailbox decision made here.
//
// The operator's words are escaped: an admin is trusted to send, not trusted to write markup into someone
// else's mail client.
import type { EmailTemplate } from "../types";
import { escapeHtml } from "./lib/escape-html";
import { emailLayout } from "./lib/email-layout";

type AdminContactData = {
  readonly subject?: unknown;
  readonly body?: unknown;
};

const subjectOf = (data: AdminContactData) => String(data.subject ?? "");

const blocks = (data: AdminContactData) => ({
  heading: subjectOf(data),
  paragraphs: [escapeHtml(data.body)],
  textParagraphs: [String(data.body ?? "")],
});

export const adminContactTemplate: EmailTemplate<"admin-contact"> =
  Object.freeze({
    id: "admin-contact",
    channel: "email",
    from: "hello",
    audience: "admin",
    subject: subjectOf,
    html: (data) => emailLayout(blocks(data)).html,
    text: (data) => emailLayout(blocks(data)).text,
  });
