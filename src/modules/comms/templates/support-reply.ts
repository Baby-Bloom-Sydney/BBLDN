// 03 §8.2 row 38 — the operator's reply to a Contact Us message, from the support mailbox (S-A-20). `08.17`.
//
// Refunds travel this road and no other: the friction is the design (02 §4.5 row 4's own comment), so this
// template carries a written reply and never a self-serve control. The body is what the operator typed, so it
// is escaped like any other input.
import type { EmailTemplate } from "../types";
import { escapeHtml } from "./lib/escape-html";
import { emailLayout } from "./lib/email-layout";

type ReplyData = { readonly subject?: unknown; readonly body?: unknown };

const subjectOf = (data: ReplyData) =>
  String(data.subject ?? "Your message to us");

const blocks = (data: ReplyData) => ({
  heading: subjectOf(data),
  paragraphs: [escapeHtml(data.body)],
  textParagraphs: [String(data.body ?? "")],
});

export const supportReplyTemplate: EmailTemplate<"support-reply"> =
  Object.freeze({
    id: "support-reply",
    channel: "email",
    from: "support",
    audience: "support",
    subject: subjectOf,
    html: (data) => emailLayout(blocks(data)).html,
    text: (data) => emailLayout(blocks(data)).text,
  });
