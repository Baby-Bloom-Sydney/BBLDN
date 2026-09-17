// 03 §8.2 row 4 — the welcome email after a nanny's account exists (04 §4.1 row 7 "welcome email ACC-001,
// sender from config"). Best effort by rule: a send that fails is logged and never fails the signup. The
// recipient is named by user id (ADR-136 — comms resolves the address in its own store).
import { comms } from "@/modules/comms";
import { log } from "@/modules/platform";
import type { UserId, Uuid } from "@/modules/shared-types";
import type { NannyWelcomeTemplate } from "../types";

const TEMPLATE: NannyWelcomeTemplate = "welcome-nanny";

export async function sendNannyWelcome(input: {
  readonly userId: UserId;
  readonly firstName: string;
}): Promise<void> {
  const sent = await comms.send({
    channel: "email",
    templateId: TEMPLATE,
    to: { userId: input.userId as string as Uuid, name: input.firstName },
    data: { firstName: input.firstName },
    dedupeKey: `welcome:${input.userId}`,
  });
  if (!sent.ok)
    log.warn("welcome email not sent", {
      module: "onboarding-nanny",
      action: "sendNannyWelcome",
      cause: sent.error,
    });
}
