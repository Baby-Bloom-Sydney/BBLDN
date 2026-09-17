// 03 §8.3 "stage-model side effects → `TemplateId`" for the K rows: which message a row sends, to which party.
//
// Two rules the shapes here obey. **The caller passes fully resolved data** (03 §8.1 — `comms` never looks a
// person up), so a row with no resolved recipient sends nothing rather than guessing an address. And a message
// is **not** part of the transaction: `advance` is atomic per call (03 §2.5) and an email that has left cannot
// be rolled back, so the slice sends after the write has committed and a failed send is logged, never a failed
// transition. A parent whose connection moved and whose email bounced still has a moved connection.
//
// The rows 03 §2.4 marks "inbox only" (K-3, K-4, K-12, K-13, K-16, K-22, K-24, K-26) send no email from here;
// their inbox rows are `comms.createInboxMessage`'s and are written beside the transition, not instead of it.
import type { TemplateId } from "@/modules/comms";
import type { TransitionId } from "@/modules/shared-types";

/** Who a row's message goes to. A row can name both (K-8 / K-9 / K-11 send to each party, separately). */
export type MessageTarget = "parent" | "nanny";

export type RowMessage = {
  readonly to: MessageTarget;
  readonly templateId: TemplateId;
};

const MESSAGES_OF: Readonly<Record<string, ReadonlyArray<RowMessage>>> =
  Object.freeze({
    "K-1": [{ to: "nanny", templateId: "connection-requested" }],
    "K-5": [{ to: "parent", templateId: "connection-accepted" }],
    "K-6": [{ to: "parent", templateId: "connection-declined" }],
    "K-8": [
      { to: "parent", templateId: "connection-expired-parent" },
      { to: "nanny", templateId: "connection-expired-nanny" },
    ],
    "K-9": [
      { to: "parent", templateId: "meeting-scheduled" },
      { to: "nanny", templateId: "meeting-scheduled" },
    ],
    "K-10": [{ to: "parent", templateId: "connection-expired-parent" }],
    "K-11": [
      { to: "parent", templateId: "meeting-scheduled" },
      { to: "nanny", templateId: "meeting-scheduled" },
    ],
    // 03 §2.4 K-17: "`confirm-nanny` (parent) **or** `position-offered` (nanny) — **the other party**". One
    // message, not two: the party who indicated the hire already knows. `messagesFor` drops the initiator's.
    "K-17": [
      { to: "parent", templateId: "confirm-nanny" },
      { to: "nanny", templateId: "position-offered" },
    ],
    "K-20": [
      { to: "parent", templateId: "placement-confirmed-parent" },
      { to: "nanny", templateId: "placement-confirmed-nanny" },
      { to: "parent", templateId: "hire-confirmation-family" },
      { to: "nanny", templateId: "hire-confirmation-nanny" },
    ],
  });

export const messagesFor = (
  id: TransitionId,
  initiatedBy?: "parent" | "nanny" | "admin",
): ReadonlyArray<RowMessage> => {
  const rows = MESSAGES_OF[id] ?? [];
  if (id !== "K-17") return rows;
  // an admin on behalf is neither party, so both sides are told
  if (initiatedBy === undefined || initiatedBy === "admin") return rows;
  return rows.filter((row) => row.to !== initiatedBy);
};
