// One message through the seam: validate (03 §8.4) → dedupe (a live key returns the existing id) → render →
// record the row → deliver → settle. `status: 'queued'` stops after the row: that is `schedule`, and
// `send-delayed-emails` (01 §4f) delivers it later. No business rule lives here.
import { newId } from "@/modules/platform";
import type { MessageId, Result } from "@/modules/shared-types";
import type {
  CommsDeps,
  CommsErrorDetails,
  IsoClock,
  Message,
  MessageStatus,
} from "../types";
import { validateMessage } from "./validate-message";

export async function deliverMessage(
  deps: CommsDeps,
  clock: IsoClock,
  message: Message,
  status: MessageStatus,
): Promise<Result<MessageId, CommsErrorDetails>> {
  const valid = validateMessage(message, clock());
  if (!valid.ok) return valid;

  if (message.dedupeKey !== undefined) {
    const live = await deps.store.findLiveByDedupeKey(message.dedupeKey);
    if (!live.ok) return live;
    if (live.value !== null) return { ok: true, value: live.value };
  }

  const rendered = await deps.renderer.render(message, newId<MessageId>());
  if (!rendered.ok) return rendered;

  const recorded = await deps.store.record({
    ...rendered.value,
    templateId: message.templateId,
    channel: message.channel,
    status,
    ...(message.sendAt === undefined ? {} : { sendAt: message.sendAt }),
    ...(message.dedupeKey === undefined
      ? {}
      : { dedupeKey: message.dedupeKey }),
  });
  if (!recorded.ok || status === "queued") return recorded;

  const ack = await deps.email.send(rendered.value);
  const settled = await deps.store.settle(
    recorded.value,
    ack.ok
      ? {
          status: "sent",
          providerMessageId: ack.value.providerMessageId,
          sentAt: clock(),
        }
      : { status: "failed" },
  );
  if (!settled.ok) return settled;
  return ack.ok ? recorded : ack;
}
