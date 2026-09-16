// Test doubles for the two ports this unit does not build: the `email_logs` / `inbox_messages` store (02 R-3,
// a table that is not on `main` yet) and the template renderer (no template file is written by this unit).
import { newId } from "@/modules/platform";
import type { MessageId, Result, Uuid } from "@/modules/shared-types";
import type {
  CommsErrorDetails,
  CommsStore,
  InboxMessage,
  Message,
  MessageState,
  MessageStatus,
  RenderedEmail,
  TemplateId,
  TemplateRenderer,
} from "../../types";

export type StoredRow = RenderedEmail &
  Partial<MessageState> & {
    readonly templateId: TemplateId;
    readonly status: MessageStatus;
    readonly dedupeKey?: string;
  };

export type MemoryCommsStore = CommsStore & {
  readonly rows: ReadonlyArray<StoredRow>;
  readonly inbox: ReadonlyArray<InboxMessage>;
};

const okOf = <T>(value: T): Result<T, CommsErrorDetails> => ({
  ok: true,
  value,
});

export function memoryCommsStore(): MemoryCommsStore {
  let rows: ReadonlyArray<StoredRow> = [];
  let inbox: ReadonlyArray<InboxMessage> = [];
  const replace = (id: MessageId, next: (row: StoredRow) => StoredRow) => {
    rows = rows.map((row) => (row.messageId === id ? next(row) : row));
  };
  return {
    get rows() {
      return rows;
    },
    get inbox() {
      return inbox;
    },
    findLiveByDedupeKey: async (dedupeKey) =>
      okOf(
        rows.find(
          (row) => row.dedupeKey === dedupeKey && row.status !== "cancelled",
        )?.messageId ?? null,
      ),
    record: async (input) => {
      rows = [...rows, input];
      return okOf(input.messageId);
    },
    settle: async (messageId, state) => {
      replace(messageId, (row) => ({ ...row, ...state }));
      return okOf(undefined);
    },
    read: async (messageId) => {
      const row = rows.find((candidate) => candidate.messageId === messageId);
      return okOf({ status: row?.status ?? "failed" } as MessageState);
    },
    cancelByDedupeKey: async (dedupeKey) => {
      const hits = rows.filter((row) => row.dedupeKey === dedupeKey);
      rows = rows.map((row) =>
        row.dedupeKey === dedupeKey
          ? { ...row, status: "cancelled" as const }
          : row,
      );
      return okOf({ cancelled: hits.length });
    },
    createInboxMessage: async (msg) => {
      inbox = [...inbox, msg];
      return okOf({ id: newId<Uuid>() });
    },
  };
}

/** Stands in for the template files (03 §8.1 "one file per template"), which this unit does not write. */
export const fakeRenderer: TemplateRenderer = Object.freeze({
  render: async (message: Message, messageId: MessageId) =>
    okOf({
      messageId,
      to: message.to,
      from: message.from ?? "noreply",
      subject: message.templateId,
      html: "<p></p>",
      text: "",
    } satisfies RenderedEmail),
});
