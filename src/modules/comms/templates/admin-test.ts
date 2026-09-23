// 03 §8.2 row 41 — `GET /api/dev/test-email`, development only (`08.19`). The one template `comms` itself owns.
//
// What it is for: the *first* thing run once the London sending domain is verified in Resend. It proves the key,
// the domain, the sender mailbox and the `email_logs` row in one call, before any journey mail depends on them.
// It says which environment it came from so a test send from the wrong deployment is obvious in the inbox.
import type { EmailTemplate } from "../types";
import { appUrl } from "./lib/app-url";
import { escapeHtml } from "./lib/escape-html";
import { formatLondonDateTime } from "./lib/format-london-date-time";
import { emailLayout } from "./lib/email-layout";

type TestData = { readonly at?: unknown; readonly environment?: unknown };

const blocks = (data: TestData) => {
  const when = formatLondonDateTime(data.at);
  const line =
    `Sending works. This message was raised by the test-email route` +
    `${data.environment === undefined ? "" : ` in ${String(data.environment)}`}` +
    `${when === "" ? "" : ` at ${when}`}.`;
  return {
    heading: "Test email",
    paragraphs: [escapeHtml(line)],
    textParagraphs: [line],
    cta: { label: "Open the app", href: appUrl() },
  };
};

export const adminTestTemplate: EmailTemplate<"admin-test"> = Object.freeze({
  id: "admin-test",
  channel: "email",
  from: "noreply",
  audience: "admin",
  subject: () => "Test email",
  html: (data) => emailLayout(blocks(data)).html,
  text: (data) => emailLayout(blocks(data)).text,
});
