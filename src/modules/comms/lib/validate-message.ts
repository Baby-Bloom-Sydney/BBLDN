// 03 §8.4's validation, at the boundary and once (01 §4a rule 3). Everything here is a rule the contract
// states outright: no `sms` channel day one (N-11), a known template id, no `sendAt` in the past. Template
// payload schemas are the template files' business and do not exist yet (README "Gaps").
//
// **The recipient is no longer checked here.** Under ADR-136 a `Recipient` may be `{ userId }`, which has no
// address to check until the store has resolved it — so `invalid-recipient` is raised by `resolve-recipient.ts`,
// one step later in `deliverMessage`, where both forms have become an address.
import { err, ok } from "@/modules/platform";
import type { IsoInstant, Result } from "@/modules/shared-types";
import type { CommsErrorDetails, Message } from "../types";
import { TEMPLATE_IDS } from "./template-ids";

const KNOWN_TEMPLATES: ReadonlySet<string> = new Set(TEMPLATE_IDS);

export function validateMessage(
  message: Message,
  now: IsoInstant,
): Result<void, CommsErrorDetails> {
  if (message.channel !== "email") {
    return err("VALIDATION", "This channel is not available", {
      reason: "sms-not-available",
    });
  }
  if (!KNOWN_TEMPLATES.has(message.templateId)) {
    return err("VALIDATION", "Unknown message template", {
      reason: "unknown-template",
    });
  }
  if (message.sendAt !== undefined && message.sendAt < now) {
    return err("VALIDATION", "That send time has already passed", {
      reason: "send-at-in-past",
    });
  }
  return ok(undefined);
}
