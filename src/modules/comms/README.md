# comms

**What it does.** The one outbound seam for every message — parent, nanny, admin, support (03 §8). A service
module (01 §2.4; ADR-069, ADR-116): **any** module may import it through `index.ts`, and it imports only
`config`, `shared-types` and `platform`. Comms renders and sends; it never fetches a profile, a position or a
booking, and it never decides which message fires — that is the calling module's (03 §8.3).

**Connector** (03 §8.1).

| Area      | Values                                                                                     | Types                                                                                                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| seam      | `comms` · `configureComms` · `createComms` · `unconfiguredComms`                           | `Comms` · `Message` · `Recipient` · `MessageStatus` · `MessageState` · `InboxMessage` · `AdminNotificationInput` (ADR-160: `notifyAdmin` — the one writer of `admin_notifications`, at service scope through the store; the kind is 02 §3's enum, validated at the seam; one open row per (kind, subject) is the table's own index) |
| registry  | `TEMPLATE_IDS`                                                                             | `TemplateRegistry` · `TemplateId` · `TemplateData`                                                                                                                                                                                                                                                                                  |
| providers | `emailProviderFor` · `stubEmailProvider` (`comms/email`) · `nullSmsProvider` (`comms/sms`) | `EmailProvider` · `SmsProvider` · `RenderedEmail` · `EmailProviderId` · `SmsProviderId`                                                                                                                                                                                                                                             |
| ports     | —                                                                                          | `CommsStore` · `TemplateRenderer` · `CommsDeps` · `CommsErrorDetails`                                                                                                                                                                                                                                                               |

**Fail-closed by default.** The module-level `comms` answers `INTERNAL { reason: 'comms-not-configured' }`
until boot calls `configureComms(createComms({ … }))` (F-c `src/instrumentation.ts`). There is no template
file and no `email_logs` table on `main` yet, and a seam that swallowed a send would be worse than one that
says so (01 §4a rule 2).

**Stubs (05 §3 rule 1 — selected by config, never by editing an import).**

- **`stub-email`** (`comms/email/stub-email.ts`) — records the rendered message on `stubEmailProvider.sent`
  and delivers nothing. Selected by `EMAIL_PROVIDER=stub-email`. `emailProviderFor('resend')` **refuses**
  rather than falling back: the Resend provider is Phase 1 and is not installed.
- **`null-sms`** (`comms/sms/null-sms.ts`) — the slot exists and does nothing (N-11, ADR-063). It cannot be
  reached, because `validateMessage` rejects `channel: 'sms'` first; if it ever is, it returns
  `PROVIDER_ERROR` rather than reporting a send.

**What it may import.** `@/modules/config` (+ `@/modules/config/server`), `@/modules/shared-types`,
`@/modules/platform` — nothing else, ever (01 §2.3 row; pinned by `comms.repo.test.ts`).

**ADR-136 — `comms` is the one module that may know an address.** A `Recipient` is `{ userId }` or `{ email }`;
the `{ userId }` form is resolved inside a send by `CommsStore.resolveRecipient`, over `user_profiles` keyed on
`user_id` at **service scope**, and the resolved address is written onto the `email_logs` row and **never
returned to the caller**. `{ email }` exists only for someone who is not a user yet (a lead, a public contact
form). This replaces "the caller passes fully resolved data" and is stricter than it: `1e` could not send
`precheck-nanny` and `1g` could not send `connection-requested` because 07 §5.2 keeps a nanny's address out of
`nanny_public` and no document authorised a business module to read her contact details — under ADR-136 none
ever will. Every way a recipient fails to resolve answers the same `invalid-recipient`, so a send cannot be used
to enumerate user ids (07 §4). Pinned in `comms.recipient.test.ts`.

**Gaps (recorded, not hidden).**

1. **03 §8.2 is headed "41 ids" but names 46 distinct id strings** — five numbered rows carry a parent/nanny
   pair (`connection-expired-*`, `placement-confirmed-*`, `hire-confirmation-*`, `verification-barred` +
   `admin-nanny-barred`, `contact-request` + `contact-request-public`). Every id the table names is in
   `TEMPLATE_IDS`; the heading's count is the defect. Foundations question for the owner of 03 §8.
2. **`MessageStatus` and 02 §3 `message_status` disagree** — the contract adds `deduped` and spells the dry
   run `dry-run`; the column has neither and spells it `dry_run`. The connector follows 03; the mapping to
   the column belongs with the `email_logs` store.
3. **No template file exists.** `TemplateRegistry` entries are all `TemplateData` (an open record) until each
   template narrows its own. `createComms` therefore takes a `TemplateRenderer` port.
4. **No `email_logs` / `inbox_messages` store.** `CommsStore` is a port; the tables are S5's and the reader
   is `auth`'s data-access port. Until boot installs one, nothing sends.
5. **`sendMany` is sequential.** Chunking by the provider's batch size is the Resend provider's business
   (03 §8.1) and lands with it.
6. **No log lines and no `message.*` events yet** (03 §8.4 / §11 row 7). They belong with the store, which
   is what gives them a `messageId` worth logging.

<!-- audit
Last edited: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b (ADR-117 Tier B) — connector, 46-id registry, the stub-email / null-sms bindings and the four ports. No template and no store: both are recorded gaps, and the module fails closed until boot configures it.
-->
