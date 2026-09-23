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
until boot calls `configureComms(createComms({ … }))` (`src/instrumentation.ts`). A send is refused rather
than swallowed at every step it can fail: an unknown id, an unresolvable recipient, an id whose **template
file** does not exist yet (`template-schema`), a provider with no key. A seam that swallowed a send — or sent a
blank body — would be worse than one that says so (01 §4a rule 2).

**The sender (4a — `08.01` · `11.29` · `08.03` · `08.17` · `08.18` · `08.19`).**

- **`resend`** (`comms/email/resend-email.ts`) is installed and selected by `EMAIL_PROVIDER`. It reads no env
  name and knows no address: boot hands it `RESEND_API_KEY` and `config`'s `SENDERS`, so the London sending
  domain is a value in `config` and not a string in this module. With no key it **refuses** rather than falling
  back to the stub. A `SenderKey` the table does not carry answers `sender-unknown`.
- **Templates** (`comms/templates/`) are one file per id — `{ id, channel, from, audience, subject, html, text }`
  (03 §8.1) — over the three rendering helpers 03 §8.1 names (`formatLondonDateTime` · `appUrl` · `footer`) and
  one shell (`emailLayout`). Every interpolated value is escaped (`escape-html.ts`): the contact form is an
  anonymous POST, so a template body is untrusted input rendered as markup in someone else's mail client.
  **Five files exist**, the ones 4a owns; every other id answers `template-schema` until its unit writes it.
- **The dev dry run** (`08.03`) is `CommsDeps.dryRun`, passed by boot from the `config` flag: the row is
  rendered and recorded at `dry-run` and the provider is never called.

★ **The registry was open in one direction, and it cost two sends.** `TEMPLATE_IDS` is what `validateMessage`
checks against, and `as const satisfies ReadonlyArray<TemplateId>` proves only that each entry _is_ an id.
ADR-168 (b) added `verification-suspension-lifted` and `admin-nanny-suspension-lifted` to `TemplateRegistry`
and not to the list, so the seam answered `unknown-template` to both sends the lift-suspension road was built
to make — and 4,800 green tests agreed. Both ids are listed now and the guard is a **gate**, not a note:
`EveryTemplateIdIsListed` (`types.ts`) fails `typecheck` and names the missing id.

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

0. **Twelve declared ids have no caller** (the other direction of the same check). `precheck-nanny-reminder` ·
   `precheck-parent-response` (suppressed by design — 03 §12 item 11) · `precheck-complete` ·
   `connection-followup-parent` · `meeting-followup-nanny` · `trial-followup-nanny` · `no-candidates-left` ·
   `feed-post` · `support-reply` · `admin-contact` · `availability-updated` · `contact-request`. Each is owed
   by the unit 03 §8.2 names as its owner; `availability-updated` additionally has no lever to fire it
   (`admin-on-behalf` exposes no availability write).
1. **03 §8.2 is headed "46 ids" but `TemplateRegistry` declares 48** — ADR-168 (b) added two after the table
   was written. The heading's count is the defect; the registry is right.
2. **The original count note: the section is headed "41 ids" but names 46 distinct id strings** — five numbered rows carry a parent/nanny
   pair (`connection-expired-*`, `placement-confirmed-*`, `hire-confirmation-*`, `verification-barred` +
   `admin-nanny-barred`, `contact-request` + `contact-request-public`). Every id the table names is in
   `TEMPLATE_IDS`; the heading's count is the defect. Foundations question for the owner of 03 §8.
3. **`MessageStatus` and 02 §3 `message_status` disagree** — the contract adds `deduped` and spells the dry
   run `dry-run`; the column has neither and spells it `dry_run`. The connector follows 03; the mapping to
   the column belongs with the `email_logs` store.
4. **Template payloads are still untyped.** `TemplateRegistry` entries are all `TemplateData` (an open record);
   each narrows when its file declares its own shape. 03 §8.4's "template without a schema → `INTERNAL`" is
   therefore the missing-**file** case today, not a payload check.
5. ~~No `email_logs` / `inbox_messages` store.~~ **Closed** — `dbCommsStore` (S5b).
6. **`sendMany` is still sequential.** `resend-email.ts` has `sendBatch` over Resend's batch endpoint, but
   `createComms.sendMany` walks `send` for its per-row `email_logs` bookkeeping. Chunking belongs with the
   pre-check waves that need it (03 §8.1).
7. **No log lines and no `message.*` events yet** (03 §8.4 / §11 row 7) — `ALERT_EMAIL_SEND_FAILED` and
   `ALERT_PROVIDER_DOWN` included. Owed.
8. **Nothing is proven against a live Resend account.** Every claim here is driven against `stub-email`; the
   key, the DNS records and the domain verification are BAI's and untested until the domain exists.

<!-- audit
Last edited: 2026-09-23T13:55+10:00 — BB-LDN-Planner-070926/4a
Notes: 4a (the sender) — resend installed and handed its key + SENDERS by boot; the template seam with five files, three helpers and HTML escaping; the dev dry run; TEMPLATE_IDS closed in both directions behind a typecheck gate. Gaps re-stated: twelve ids with no caller, 46-vs-48, nothing proven against a live Resend account.
Previous: Last edited: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b (ADR-117 Tier B) — connector, 46-id registry, the stub-email / null-sms bindings and the four ports. No template and no store: both are recorded gaps, and the module fails closed until boot configures it.
-->
