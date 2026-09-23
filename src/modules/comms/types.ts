// 03 §8.1 — the comms contract. `comms` is a service module (01 §2.4; ADR-069, ADR-116): importable by every
// module through this connector, and importing only `config`, `shared-types` and `platform` itself. Comms
// renders and sends; it never fetches a profile, a position or a booking — the caller passes fully resolved
// data (03 §8.1 "comms renders, it does not decide").
import type { Sender, SenderKey } from "@/modules/config";
import type {
  Actor,
  E164,
  Email,
  EnumValue,
  IsoInstant,
  MessageId,
  Result,
  UnitOfWork,
  Url,
  Uuid,
} from "@/modules/shared-types";

/** 02 §3 `message_channel`; `sms` is a slot with no bound provider day one (N-11, ADR-063). */
export type Channel = EnumValue<"message_channel">;

/**
 * 03 §8.1's status union. It is **not** 02 §3's `message_status` enum: the contract adds `deduped` and spells
 * the dry run `dry-run` where the column spells it `dry_run`. Recorded as a gap, not reconciled here — a
 * connector may not rename a column and a column may not silence a contract (see README "Gaps").
 */
export type MessageStatus =
  | "queued"
  | "sent"
  | "failed"
  | "bounced"
  | "cancelled"
  | "deduped"
  | "dry-run";

/**
 * 03 §8.1 as ADR-136 amends it: **a caller names a person, it does not carry an address.**
 *
 * `{ userId }` is the normal form — `comms` resolves the address inside the send, from its own store, at
 * service scope. `{ email }` is for someone who is **not a user yet** (a lead, a public contact form), where
 * there is no id to name.
 *
 * The rule this replaces said "resolved by the caller", and the cost of it was measured twice: `1e` could not
 * send `precheck-nanny` and `1g` could not send `connection-requested`, because 07 §5.2 keeps a nanny's address
 * out of `nanny_public` and **no document authorises a business module to read her contact details**. Moving the
 * read to `comms` — the one owner of sends (01 §2.4), which already writes `email_logs` under service scope —
 * is stricter than the old rule, not looser: a business module can no longer obtain an address at all.
 */
export type Recipient =
  | { readonly userId: Uuid; readonly name?: string }
  | { readonly email: Email; readonly name?: string };

/**
 * What a `Recipient` becomes once the send has resolved it. It exists **inside a send** and nowhere else: it is
 * never a parameter, never returned by the connector, and the only place it comes to rest is the `email_logs`
 * row (`recipient_email` / `recipient_user_id`), which is where 07 §6.1's deletion job expects to find it.
 */
export type ResolvedRecipient = {
  readonly email: Email;
  readonly userId?: Uuid;
  readonly name?: string;
};

/**
 * One template's payload. Each registry entry narrows to its own shape when its template file lands (03 §8.1
 * "one file per template"); until then every entry is this open record — the ids are closed, the payloads are
 * not. No template is written by this unit.
 */
export type TemplateData = Readonly<Record<string, unknown>>;

/**
 * 03 §8.2 — the registry. The section is headed "46 ids" (its own table names 46 distinct id strings, because
 * five numbered rows carry a `parent` / `nanny` pair) and **48** are declared here: ADR-168 (b) added the two
 * suspension-lifted ids after the table was written. The heading's count is the foundations gap, not the
 * registry — recorded rather than resolved by dropping an id (README "Gaps" 1).
 */
export interface TemplateRegistry {
  "welcome-parent": TemplateData;
  "welcome-parent-position": TemplateData;
  "welcome-parent-invited": TemplateData;
  "welcome-nanny": TemplateData;
  "call-confirmation": TemplateData;
  "call-rescheduled": TemplateData;
  "call-cancelled": TemplateData;
  "call-reminder": TemplateData;
  "admin-call-due": TemplateData;
  "admin-commission-booking": TemplateData;
  "precheck-nanny": TemplateData;
  "precheck-nanny-reminder": TemplateData;
  "precheck-parent-response": TemplateData;
  "precheck-complete": TemplateData;
  "connection-requested": TemplateData;
  "connection-accepted": TemplateData;
  "connection-declined": TemplateData;
  "connection-expired-parent": TemplateData;
  "connection-expired-nanny": TemplateData;
  "meeting-scheduled": TemplateData;
  "connection-followup-parent": TemplateData;
  "meeting-followup-nanny": TemplateData;
  "trial-followup-nanny": TemplateData;
  "confirm-nanny": TemplateData;
  "position-offered": TemplateData;
  "no-candidates-left": TemplateData;
  "placement-confirmed-parent": TemplateData;
  "placement-confirmed-nanny": TemplateData;
  "hire-confirmation-family": TemplateData;
  "hire-confirmation-nanny": TemplateData;
  "verification-pending": TemplateData;
  "verification-approved": TemplateData;
  "verification-action-needed": TemplateData;
  "verification-barred": TemplateData;
  "admin-nanny-barred": TemplateData;
  /** ADR-168 (b) — a bar was lifted: one neutral sentence to her, the mailbox row to the operator. */
  "verification-suspension-lifted": TemplateData;
  "admin-nanny-suspension-lifted": TemplateData;
  "verification-reminder": TemplateData;
  "bundle-payment-link": TemplateData;
  "app-ready": TemplateData;
  "trial-reminder": TemplateData;
  "feed-post": TemplateData;
  "contact-request": TemplateData;
  "contact-request-public": TemplateData;
  "support-reply": TemplateData;
  "admin-contact": TemplateData;
  "availability-updated": TemplateData;
  "admin-test": TemplateData;
}

/** Closed union, one entry per template (03 §8.1). */
export type TemplateId = keyof TemplateRegistry;

/**
 * ★ **4a's gate.** `TEMPLATE_IDS` (`lib/template-ids.ts`) is the runtime list `validate-message.ts` checks a send
 * against, and `as const satisfies ReadonlyArray<TemplateId>` proves only that every **entry is** an id — never
 * that every id is **present**. ADR-168 (b) added two ids above and left the list alone, so the seam answered
 * `unknown-template` to both suspension-lifted sends the lift road was built to make, and nothing failed.
 *
 * `Assert<T extends true>` will not compile unless `T` is `true`, and the conditional resolves to the **missing
 * id itself** when one is missing — so the compiler error names it (`Type '"admin-test"' does not satisfy the
 * constraint 'true'`) rather than saying `false`. `typecheck` is a required check, so the two cannot drift again.
 * The list is reached by `typeof import(...)`, which keeps this a type-only file.
 */
type Assert<T extends true> = T;
type UnlistedTemplateId = Exclude<
  TemplateId,
  (typeof import("./lib/template-ids").TEMPLATE_IDS)[number]
>;
export type EveryTemplateIdIsListed = Assert<
  [UnlistedTemplateId] extends [never] ? true : UnlistedTemplateId
>;

export type Attachment = {
  readonly filename: string;
  readonly storagePath: string;
};

export type Message<Id extends TemplateId = TemplateId> = {
  readonly channel: Channel;
  readonly templateId: Id;
  readonly to: Recipient;
  readonly data: TemplateRegistry[Id];
  readonly sendAt?: IsoInstant;
  readonly dedupeKey?: string;
  readonly from?: SenderKey;
  readonly replyTo?: Email;
  readonly attachments?: ReadonlyArray<Attachment>;
};

/**
 * The same message with its recipient resolved — what the renderer and the provider see, and the only shape in
 * which an address exists inside this module. A template that wants to greet someone reads `to.name`.
 */
export type ResolvedMessage<Id extends TemplateId = TemplateId> = Omit<
  Message<Id>,
  "to"
> & { readonly to: ResolvedRecipient };

/** 02 §3 leaves `inbox_messages.type` deliberately **text, open set** — so does this. */
export type InboxType = string;

/**
 * ADR-160 — `admin_notifications` (02 §4.6), the operator's own queue, has one writer: this seam. The kind is
 * 02 §3's enum (validated before the store is reached); the subject is what the row is about (a nanny, a
 * booking, a message…); one OPEN row per (kind, subject) is the table's own index, so a repeat is answered, not
 * duplicated.
 */
export type AdminNotificationInput = {
  readonly kind: EnumValue<"admin_notification_kind">;
  readonly subject?: { readonly type: string; readonly id: Uuid };
  readonly summary: string;
  readonly dueAt?: IsoInstant;
};

export type InboxMessage = {
  readonly userId: Uuid;
  readonly type: InboxType;
  readonly title: string;
  readonly body: string;
  readonly actionUrl?: Url;
  readonly reference?: { readonly type: string; readonly id: string };
  readonly actor: Actor;
};

/** 03 §8.4's error reasons, plus the four "port not installed yet" reasons this unit's fail-closed defaults use. */
export type CommsReason =
  | "sms-not-available"
  | "unknown-template"
  | "invalid-recipient"
  | "send-at-in-past"
  | "sender-unknown"
  | "attachment-missing"
  | "template-schema"
  | "provider-rejected"
  /** `notifyAdmin` with a kind outside 02 §3's `admin_notification_kind` (ADR-160) */
  | "unknown-kind"
  | "comms-not-configured"
  | "store-not-configured"
  /**
   * 4a: no longer reachable — boot always installs `createTemplateRenderer`, and an id with no file answers
   * `template-schema` (03 §8.4's own word for a template without a schema). Kept in the union because it is the
   * honest answer if a future boot ever leaves the port open, and removing it would make that case silent.
   */
  | "renderer-not-configured"
  /** `status(messageId)` for an id no `email_logs` row carries (S5b: the real store answers NOT_FOUND, never a made-up status) */
  | "unknown-message";

export type CommsErrorDetails = {
  readonly reason: CommsReason;
  readonly provider?: string;
};

export type MessageState = {
  readonly status: MessageStatus;
  readonly providerMessageId?: string;
  readonly sentAt?: IsoInstant;
};

/** 03 §8.1 — the connector every module may import. */
export type Comms = {
  send(message: Message): Promise<Result<MessageId, CommsErrorDetails>>;
  sendMany(
    messages: ReadonlyArray<Message>,
  ): Promise<Result<ReadonlyArray<MessageId>, CommsErrorDetails>>;
  schedule(
    message: Message & { readonly sendAt: IsoInstant },
  ): Promise<Result<MessageId, CommsErrorDetails>>;
  cancel(
    dedupeKey: string,
  ): Promise<Result<{ readonly cancelled: number }, CommsErrorDetails>>;
  status(
    messageId: MessageId,
  ): Promise<Result<MessageState, CommsErrorDetails>>;
  createInboxMessage(
    msg: InboxMessage,
    opts?: { readonly uow?: UnitOfWork },
  ): Promise<Result<{ readonly id: Uuid }, CommsErrorDetails>>;
  /** ADR-160: the one writer of `admin_notifications`; idempotent on the open-row index */
  notifyAdmin(
    input: AdminNotificationInput,
  ): Promise<Result<{ readonly id: Uuid }, CommsErrorDetails>>;
};

/** What a provider is handed: already rendered, already resolved, no template knowledge. */
export type RenderedEmail = {
  readonly messageId: MessageId;
  readonly to: ResolvedRecipient;
  readonly from: SenderKey;
  readonly replyTo?: Email;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly attachments?: ReadonlyArray<Attachment>;
};

export type ProviderAck = { readonly providerMessageId: string };

/**
 * The seven mailboxes of 03 §8.1, as the provider sees them. `comms` may not carry an address literal (L4), so
 * boot hands `config`'s `SENDERS` in and a provider resolves a `SenderKey` against this table — or refuses
 * (`sender-unknown`) rather than quietly sending from the wrong one.
 */
export type SenderTable = Readonly<Record<SenderKey, Sender>>;

/** What `emailProviderFor` needs to build a real provider. Absent or empty = the binding refuses (fail closed). */
export type EmailProviderOptions = {
  readonly apiKey?: string;
  readonly senders?: SenderTable;
};

/** 03 §8.1 `EmailProvider`. Bindings: `resend` (`08.01`) | `stub-email` (ADR-141) — `EMAIL_PROVIDER`. */
export type EmailProvider = {
  readonly id: string;
  send(input: RenderedEmail): Promise<Result<ProviderAck, CommsErrorDetails>>;
  sendBatch(
    inputs: ReadonlyArray<RenderedEmail>,
  ): Promise<Result<ReadonlyArray<ProviderAck>, CommsErrorDetails>>;
};

/** 03 §8.1 `SmsProvider`. The only binding is `null-sms` (N-11); the channel is rejected before it is reached. */
export type SmsProvider = {
  readonly id: string;
  send(input: {
    readonly to: E164;
    readonly body: string;
    readonly senderId: string;
  }): Promise<Result<ProviderAck, CommsErrorDetails>>;
};

/**
 * 03 §8.1 — who a template is written for. The `parent` audience is the one the banned-words test polices
 * (glossary §6), so it is declared on the template rather than inferred from the recipient.
 */
export type TemplateAudience = "parent" | "nanny" | "admin" | "support";

/**
 * 03 §8.1's template file, one per id: `{ id, channel, subject(data), html(data), text(data), from, audience }`.
 * No brand, domain, mailbox or URL literal lives in one — those are `config`, reached through the rendering
 * helpers (`templates/lib/`). Both bodies are always produced: a template that rendered HTML only would leave a
 * plain-text reader with nothing.
 */
export type EmailTemplate<Id extends TemplateId = TemplateId> = {
  readonly id: Id;
  readonly channel: Channel;
  readonly from: SenderKey;
  readonly audience: TemplateAudience;
  subject(data: TemplateRegistry[Id]): string;
  html(data: TemplateRegistry[Id]): string;
  text(data: TemplateRegistry[Id]): string;
};

/**
 * The template files that exist. **Partial on purpose** — the id union is closed (03 §8.2) and the files land
 * with the units that fire them (03 §8.3), so an id with no file must be a loud `INTERNAL` at render time, not
 * a blank body in someone's inbox. `createTemplateRenderer` is what turns the gap into that refusal.
 */
export type EmailTemplates = Partial<
  Readonly<Record<TemplateId, EmailTemplate>>
>;

/** The template seam. Its inside is one file per template (`templates/`), reached through the registry above. */
export type TemplateRenderer = {
  render(
    message: ResolvedMessage,
    messageId: MessageId,
  ): Promise<Result<RenderedEmail, CommsErrorDetails>>;
};

/**
 * The `email_logs` / `inbox_messages` port (02 R-3). It is the module's only storage reach and it does not
 * exist yet — boot installs it over `auth`'s data-access port once the tables are on `main`.
 */
export type CommsStore = {
  /**
   * ADR-136 — the one read that makes `{ userId }` sendable: `user_profiles` keyed on `user_id` (ADR-131 (1)),
   * at **service scope**, inside the store that already writes `email_logs` under it. Used only by a send; the
   * address it answers is written onto the `email_logs` row and **never returned to the caller**, which is what
   * keeps a business module unable to obtain one.
   *
   * A user id nothing resolves is `invalid-recipient` — the same refusal a malformed address gets, deliberately:
   * a caller must not be able to tell "no such user" from "a bad address" (07 §4).
   */
  resolveRecipient(
    userId: Uuid,
  ): Promise<Result<ResolvedRecipient, CommsErrorDetails>>;
  findLiveByDedupeKey(
    dedupeKey: string,
  ): Promise<Result<MessageId | null, CommsErrorDetails>>;
  record(
    input: RenderedEmail & {
      readonly templateId: TemplateId;
      readonly channel: Channel;
      readonly status: MessageStatus;
      readonly sendAt?: IsoInstant;
      readonly dedupeKey?: string;
    },
  ): Promise<Result<MessageId, CommsErrorDetails>>;
  settle(
    messageId: MessageId,
    state: MessageState,
  ): Promise<Result<void, CommsErrorDetails>>;
  read(messageId: MessageId): Promise<Result<MessageState, CommsErrorDetails>>;
  cancelByDedupeKey(
    dedupeKey: string,
  ): Promise<Result<{ readonly cancelled: number }, CommsErrorDetails>>;
  createInboxMessage(
    msg: InboxMessage,
    opts?: { readonly uow?: UnitOfWork },
  ): Promise<Result<{ readonly id: Uuid }, CommsErrorDetails>>;
  /** ADR-160: one `admin_notifications` insert at service scope; an open row for the same (kind, subject) is answered */
  createAdminNotification(
    input: AdminNotificationInput,
  ): Promise<Result<{ readonly id: Uuid }, CommsErrorDetails>>;
};

/** The one clock, injected so tests pin time (01 §4b). */
export type IsoClock = () => IsoInstant;

export type CommsDeps = {
  readonly email: EmailProvider;
  readonly sms: SmsProvider;
  readonly store: CommsStore;
  readonly renderer: TemplateRenderer;
  /** Defaults to `platform`'s `nowInstant`. */
  readonly clock?: IsoClock;
  /**
   * `08.03` — the development dry run. True and the seam renders and records the row exactly as a live send
   * does, at status `dry-run`, and **never calls the provider**. Boot passes the dry-run flag, which `config`
   * already forces false outside development (`flags.ts`), so this module reads no flag name and no environment
   * of its own: it is handed a boolean, the way `call-layer` is handed the admin address.
   */
  readonly dryRun?: boolean;
};

/** A boot-time registration slot — the module-level `comms` reads its implementation from one of these. */
export type CommsRegistry = {
  get(): Comms;
  set(next: Comms): void;
};
