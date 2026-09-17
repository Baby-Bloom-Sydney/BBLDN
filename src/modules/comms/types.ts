// 03 §8.1 — the comms contract. `comms` is a service module (01 §2.4; ADR-069, ADR-116): importable by every
// module through this connector, and importing only `config`, `shared-types` and `platform` itself. Comms
// renders and sends; it never fetches a profile, a position or a booking — the caller passes fully resolved
// data (03 §8.1 "comms renders, it does not decide").
import type { SenderKey } from "@/modules/config";
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

/** Resolved by the caller (03 §8.1) — comms never looks a person up. */
export type Recipient = {
  readonly userId?: Uuid;
  readonly email: Email;
  readonly name?: string;
};

/**
 * One template's payload. Each registry entry narrows to its own shape when its template file lands (03 §8.1
 * "one file per template"); until then every entry is this open record — the ids are closed, the payloads are
 * not. No template is written by this unit.
 */
export type TemplateData = Readonly<Record<string, unknown>>;

/**
 * 03 §8.2 — the day-one registry. The section is headed "41 ids" but names **46 distinct id strings** (five
 * numbered rows carry a `parent` / `nanny` pair). Every id the table names is listed here; the count is
 * recorded as a foundations gap rather than resolved by dropping an id.
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

/** 02 §3 leaves `inbox_messages.type` deliberately **text, open set** — so does this. */
export type InboxType = string;

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
  | "comms-not-configured"
  | "store-not-configured"
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
};

/** What a provider is handed: already rendered, already resolved, no template knowledge. */
export type RenderedEmail = {
  readonly messageId: MessageId;
  readonly to: Recipient;
  readonly from: SenderKey;
  readonly replyTo?: Email;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly attachments?: ReadonlyArray<Attachment>;
};

export type ProviderAck = { readonly providerMessageId: string };

/** 03 §8.1 `EmailProvider`. Bindings: `resend` (Phase 1) | `stub-email` (day one) — `EMAIL_PROVIDER`. */
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

/** The template seam. No template is written by this unit, so the default renderer fails closed. */
export type TemplateRenderer = {
  render(
    message: Message,
    messageId: MessageId,
  ): Promise<Result<RenderedEmail, CommsErrorDetails>>;
};

/**
 * The `email_logs` / `inbox_messages` port (02 R-3). It is the module's only storage reach and it does not
 * exist yet — boot installs it over `auth`'s data-access port once the tables are on `main`.
 */
export type CommsStore = {
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
};

/** A boot-time registration slot — the module-level `comms` reads its implementation from one of these. */
export type CommsRegistry = {
  get(): Comms;
  set(next: Comms): void;
};
