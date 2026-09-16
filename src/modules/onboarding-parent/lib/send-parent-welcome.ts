// 03 §8.2 rows 1–3 — the welcome email after signup: `welcome-parent-position` when a position opened (path B),
// `welcome-parent-invited` for an invite arrival (path E), `welcome-parent` otherwise. Best effort by rule: a send
// that fails is logged and never fails the signup (`comms` fails closed until boot configures it — S-X-05 / S-X-06
// must still complete). The recipient is resolved here (03 §8.1: comms never looks a person up).
import { comms } from "@/modules/comms";
import { log } from "@/modules/platform";
import type { Email, UserId, Uuid } from "@/modules/shared-types";
import type { ParentWelcomeTemplate, SignupContext } from "../types";

const templateFor = (
  context: SignupContext,
  positionOpened: boolean,
): ParentWelcomeTemplate =>
  positionOpened
    ? "welcome-parent-position"
    : context.source === "invite"
      ? "welcome-parent-invited"
      : "welcome-parent";

export async function sendParentWelcome(input: {
  readonly userId: UserId;
  readonly email: Email;
  readonly firstName: string;
  readonly context: SignupContext;
  readonly positionOpened: boolean;
}): Promise<void> {
  const sent = await comms.send({
    channel: "email",
    templateId: templateFor(input.context, input.positionOpened),
    to: {
      userId: input.userId as string as Uuid,
      email: input.email,
      name: input.firstName,
    },
    data: { firstName: input.firstName },
    dedupeKey: `welcome:${input.userId}`,
  });
  if (!sent.ok)
    log.warn("welcome email not sent", {
      module: "onboarding-parent",
      action: "sendParentWelcome",
      cause: sent.error,
    });
}
