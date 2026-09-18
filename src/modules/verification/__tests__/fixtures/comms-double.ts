// A recording `Comms` double for the decision and sweep suites (05 §3 rule 2): what was sent, scheduled, cancelled
// and raised for the admin — the four things `2c`'s comms are judged on. Not `comms`' own fixture (a deep import
// of another module's test fixture is the boundary crossing 2b's lint fix removed); it honours the connector.
import { newId } from "@/modules/platform";
import type { Comms, Message } from "@/modules/comms";
import type { MessageId, Uuid } from "@/modules/shared-types";

export type CommsDouble = Comms & {
  readonly sent: ReadonlyArray<Message>;
  readonly scheduled: ReadonlyArray<Message>;
  readonly cancelled: ReadonlyArray<string>;
  readonly adminNotices: ReadonlyArray<{
    readonly kind: string;
    readonly subject?: { readonly type: string; readonly id: string };
    readonly summary: string;
  }>;
};

export function commsDouble(): CommsDouble {
  const sent: Message[] = [];
  const scheduled: Message[] = [];
  const cancelled: string[] = [];
  const adminNotices: CommsDouble["adminNotices"][number][] = [];
  const live = new Map<string, MessageId>();
  const record = (list: Message[], message: Message) => {
    const key = message.dedupeKey;
    if (key !== undefined) {
      const existing = live.get(key);
      if (existing !== undefined) return existing;
    }
    const id = newId<MessageId>();
    list.push(message);
    if (key !== undefined) live.set(key, id);
    return id;
  };
  return {
    sent,
    scheduled,
    cancelled,
    adminNotices,
    send: async (message) => ({ ok: true, value: record(sent, message) }),
    sendMany: async (messages) => ({
      ok: true,
      value: messages.map((m) => record(sent, m)),
    }),
    schedule: async (message) => ({
      ok: true,
      value: record(scheduled, message),
    }),
    cancel: async (dedupeKey) => {
      cancelled.push(dedupeKey);
      const had = live.delete(dedupeKey) ? 1 : 0;
      return { ok: true, value: { cancelled: had } };
    },
    status: async () => ({ ok: true, value: { status: "sent" } }),
    createInboxMessage: async () => ({
      ok: true,
      value: { id: newId<Uuid>() },
    }),
    notifyAdmin: async (input) => {
      adminNotices.push({
        kind: input.kind,
        ...(input.subject === undefined ? {} : { subject: input.subject }),
        summary: input.summary,
      });
      return { ok: true, value: { id: newId<Uuid>() } };
    },
  };
}
