"use server";
// S-X-23 — the contact form's one server action (01 §4e). Validates once at the boundary (01 §4a), then sends
// through `comms` with the `contact-request-public` template (03 §8.2 row 40; `replyTo` = the submitter) to the
// support inbox (S-A-20) from `config` only (L4). `comms` fails closed until boot configures it: the action then
// returns the failure as a `ClientResult`, never throws, and the form shows the support mailbox instead.
//
// ★ **07 §8 row 10 is consumed here (REVIEW-2, security HIGH-4).** This is an anonymous `"use server"` export
// that turns one unauthenticated POST into an outbound email, with `replyTo` and the rendered body both the
// submitter's. It shipped with no ceiling of any kind, so a loop floods S-A-20 *and* spends the project's
// outbound quota — which takes the password-reset flow down with it, the one flow a locked-out parent needs.
// The limit fails **closed**: ADR-134 lets only named unauthenticated *reads* fail open, and this is a send.
// Row 10's honeypot half is a change to the form and its schema; it is recorded for `public-site` to own.
import { headers } from "next/headers";
import { SENDERS } from "@/modules/config/server";
import { comms } from "@/modules/comms";
import { err, ok, toActionResult } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import type { ContactMessageAction } from "../types";
import {
  consumeContactFormLimit,
  contactFormKey,
} from "../lib/consume-contact-form-limit";
import { contactMessageSchema } from "../lib/contact-message-schema";

const FIELDS = ["name", "email", "role", "message"] as const;

export const sendContactMessageAction: ContactMessageAction = async (
  _previous: unknown,
  formData: FormData,
) => {
  const parsed = contactMessageSchema.safeParse(
    Object.fromEntries(FIELDS.map((field) => [field, formData.get(field)])),
  );
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return toActionResult(
      err(
        "VALIDATION",
        first?.message ?? "Please check your name, email and message.",
        { reason: "invalid-input", field: String(first?.path[0] ?? "") },
      ),
    );
  }
  // After validation (so a malformed submission does not spend the caller's budget) and before the send.
  const key = await contactFormKey(
    headers().get("x-forwarded-for"),
    parsed.data.email,
  );
  if (!(await consumeContactFormLimit(key)))
    return toActionResult(
      err("RATE_LIMITED", "Too many messages just now. Try again shortly.", {
        reason: "rate-limited",
      }),
    );
  const sent = await comms.send({
    channel: "email",
    templateId: "contact-request-public",
    to: {
      email: SENDERS.support.address as Email,
      name: SENDERS.support.name,
    },
    replyTo: parsed.data.email as Email,
    data: parsed.data,
  });
  return toActionResult(sent.ok ? ok(undefined) : sent);
};
