"use server";
// S-X-23 — the contact form's one server action (01 §4e). Validates once at the boundary (01 §4a), then sends
// through `comms` with the `contact-request-public` template (03 §8.2 row 40; `replyTo` = the submitter) to the
// support inbox (S-A-20) from `config` only (L4). `comms` fails closed until boot configures it: the action then
// returns the failure as a `ClientResult`, never throws, and the form shows the support mailbox instead.
import { SENDERS } from "@/modules/config/server";
import { comms } from "@/modules/comms";
import { err, ok, toActionResult } from "@/modules/platform";
import type { Email } from "@/modules/shared-types";
import type { ContactMessageAction } from "../types";
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
