# platform

**What it does.** The cross-cutting service module (01 §2.4; ADR-069) every other module imports: `log` (01 §4b),
`Events` + the `ConsentReader` seam (01 §7; 03 §9), the `Result` helpers + the `ErrorCode` → HTTP map (01 §4a), the
API envelope for route handlers and the serialisable action result (01 §4c / §4e), `withUnitOfWork` + the opaque
`UnitOfWork` token (01 §6.3; 03 §1.4), `platform/consent` (02 R-4; 07 §2.6 / §2.7(a) / §2.9), the rate limiter
(07 §8) and the upload-scan interface (07 §5.3 rule 3; ADR-106). It holds no business rule and no table of its own.

**Connector.** `index.ts` re-exports `types.ts` and, per 01 §2.5, the three named sub-modules' connectors
(`log/` · `events/` · `consent/`) plus `rate-limit/`, `upload-scan/` and `unit-of-work/`:

| Area              | Values                                                                                                                                                                  | Types (in `types.ts` / `<sub>/types.ts`)                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Result (01 §4a)   | `ok` · `err` · `fromThrown` · `toClientError` · `statusForCode`                                                                                                         | `ClientResult` · `ThrownContext`                                                                                                         |
| Envelope (01 §4c) | `envelopeOf` (pure) · `toResponse` (route handler) · `toActionResult` (server action)                                                                                   | `Envelope` · `SuccessEnvelope` · `ErrorEnvelope` · `PageMeta` · `EnvelopeOptions` · `EnvelopePayload`                                    |
| `unit-of-work/`   | `withUnitOfWork` · `currentUnitOfWork` · `createUnitOfWork(opener)` · `configureUnitOfWork` · `unitOfWorkJoin` · `rpcTransactionOpener` · `memoryTransactionOpener`     | `TransactionOpener<H>` · `UnitOfWorkBinding<H>` · `UnitOfWorkJoin` · `UnitOfWorkClaimDetails` · `RpcTransaction*` · `MemoryTransaction*` |
| Clock + ids       | `nowInstant` · `newId<T>()` — the one place a branded id is minted                                                                                                      |                                                                                                                                          |
| `log/`            | `log` · `configureLog` · `createLogger` · `consoleSink` · `scrubPii` · `ALERT_NAMES` · `nullErrorTracker` · `sentryErrorTracker` · `resolveErrorTracker`                | `Log` · `LogLine` · `LogFields` · `LogLevel` · `AlertName` · `LogSink` · `ErrorTracker` · `ErrorCaptureFn` · `LogFormat`                 |
| `events/`         | `Events` · `configureEvents` · `createEvents` · `EVENT_SCHEMAS` · `validateEmitInput` · `isClientEventName` · `memorySink` · `consoleEventSink` · `memoryEventLogStore` | 03 §9.2 verbatim: `EventEnvelope` · `EmitInput` · `Sink` · `SinkId` · … · `EventsConnector` · `EventLogStore` · `EventsDeps`             |
| `consent/`        | `consent` · `configureConsent` · `createConsent` · `CONSENT_PURPOSES` · `memoryConsentStore` (`consent.stub.ts`)                                                        | `Consent` · `ConsentReader` · `ConsentStore` · `ConsentPurpose` · `RecordConsentInput` · … · `ConsentErrorDetails`                       |
| `rate-limit/`     | `rateLimiter` · `configureRateLimiter` · `createRateLimiter` · `policyWindows` · `memoryRateLimitStore`                                                                 | `RateLimiter` · `RateLimitStore` · `RateLimitPolicy` (= config `RateLimit`) · `RateLimitDetails` · `RateLimitAllowance`                  |
| `upload-scan/`    | `uploadScanner` · `configureUploadScanner` · `stubUploadScanner` (`upload-scan.stub.ts`)                                                                                | `UploadScanner` · `ScanInput` · `ScanResult` · `ScanVerdict` · `UploadScanDetails`                                                       |

**Unit of work (ADR-127 — one RPC is one transaction).** 03 §1.4's `Query` surface is `from()` + `rpc()` over
PostgREST, which has no multi-statement client transaction, and S5 built the schema for exactly that: any write
that must be atomic across tables is a `SECURITY DEFINER` function and **the function body is the transaction**.
So the production opener, `rpcTransactionOpener`, is a **ledger, never a connection**: `begin` mints a row,
`claim` books the unit of work's one RPC, `commit` / `rollback` close the row and touch no database. What a
module gets from `withUnitOfWork(fn)` is therefore: a real opaque token (a foreign or settled one does not
resolve), the "one RPC" rule enforced by `auth`'s port through the binding's `join` — a second `rpc()` under the
same `{ uow }` is refused (`second-rpc-in-unit-of-work`), a table `insert` / `update` under it is refused
(`write-outside-rpc`, `auth/lib/guard-unit-of-work-query.ts`), reads pass — and a failing RPC that comes back as
a `Result`, never a throw. **Consequence for every seam that accepts `{ uow }`** (`Events.emit`,
`comms.createInboxMessage`, `consent.record*`): under a unit of work their row must be written by the RPC
itself — 03 §2.5 already makes `advance` write its own `events` row — and a seam that tries a table write
inside one fails the caller loudly rather than splitting the transaction. `memoryTransactionOpener` (a real
begin / commit / rollback ledger, no claim limit) stays the swap-test stub; `unitOfWorkJoin` is the module-level
join `auth`'s port defaults to, so a boot-installed binding reaches a port built without one.

**Boot wiring — the `configure*` hooks.** `platform` stays a leaf (03 §9.5 / §12 item 31): the real ports are
injected once at boot (`src/instrumentation.ts` → `src/boot/wire-ports.ts`, P1-WIRE) and by test wiring. Until
then every module-level connector **fails closed** except the two whose stub _is_ the day-one implementation:

| Connector        | Unconfigured default                                                                                                                                                | Boot installs (P1-WIRE; each binding chosen by env, never by an import edit)                                                                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `withUnitOfWork` | `INTERNAL { reason: 'unit-of-work-not-configured' }`; the join refuses every token (`unit-of-work-unknown`)                                                         | `createUnitOfWork(rpcTransactionOpener())` (ADR-127); `auth` is handed its `join`                                                                                                                                                                                                                                                                        |
| `log`            | usable: pretty console outside production, JSON in production, null tracker                                                                                         | `configureLog({ format: "json", minLevel })`; the Sentry tracker lands with the SDK (ADR-128 made the DSN optional)                                                                                                                                                                                                                                      |
| `Events`         | store refuses writes — one `warn` per emit (no uow) / the caller's transaction fails (uow)                                                                          | `createEvents({ store: dbEventLogStore(auth.data), sinks, log, consent })` — `events` insert under the service role; `queryEvents` / `countByName` **fail closed** (`event-log-read-not-available`: the `Query` surface has no predicate — 02 §7's views are the admin read)                                                                             |
| `consent`        | `INTERNAL { reason: 'consent-not-configured' }` — `hasMarketing` included (no pixel / CAPI)                                                                         | `createConsent({ store: dbConsentStore(auth.data), cookieExpiryDays, onCookieConsent, log })` — `consent_records` · `biometric_consent_records` · `legal_documents` in session scope; the cookie half **fails closed** (`cookie-consent-not-available`: a visitor's current row is a keyed read under the service role), so `hasMarketing` still refuses |
| `rateLimiter`    | **memory store** outside production; **in production it denies** (`INTERNAL`) + `ALERT_ENV_INVALID` until a shared store is installed — `assertSharedStore` (07 §8) | **nothing, deliberately** — `rate_limit_buckets` has no specification (07 §8 names it; 02 §4 / §6 never create it), and declaring the memory store "shared" is the failure the assertion exists to catch; one `warn` per boot                                                                                                                            |
| `uploadScanner`  | **the stub** — ADR-106's day-one scanner (MIME allow-list + size cap from `config/uploads`)                                                                         | the Phase 2 product via `configureUploadScanner`                                                                                                                                                                                                                                                                                                         |

**What it may import.** `@/modules/config` (the client-safe connector — never `@/modules/config/server`) and
`@/modules/shared-types` only (01 §2.3 / §2.4; pinned by `platform.repo.test.ts`), plus `zod` and `node:async_hooks`
(`unit-of-work/lib/create-unit-of-work.ts` — the nested-call join; Node runtime only, so middleware / edge must not
open a unit of work).
`events/types.ts` augments `EventPropsMap` by `declare module "@/modules/shared-types/events"` (the file the
interface lives in — declaration merging needs the declaring module, not the barrel; S6's boundary lint must allow
that one `declare module` target). The module is **client-safe**: it reads no server env; the boot code resolves
`SENTRY_DSN` and hands the tracker in.

**Named service-role uses.** None inside this module — the ports that reach Postgres (`EventLogStore`,
`ConsentStore`, `RateLimitStore`, `PrivacyStore`) are implemented by the boot code (`src/boot/db-*.ts`) over
`auth`'s data port, which names its own service-role uses (07 §5.1 rule 5: the `event-log` insert is named there;
`recordCookieConsent` will be when its store exists; **`PrivacyStore` is the `delete-account` row already on that
table**). The `TransactionOpener` reaches no database at all (ADR-127).

**Stubs (05 §3 rule 1 — production code, one export, inside the module).** `memoryTransactionOpener` ·
`memorySink` · `memoryEventLogStore` · `consent.stub.ts` (`memoryConsentStore`) · `privacy.stub.ts`
(`memoryPrivacyStore`) · `memoryRateLimitStore` ·
`upload-scan.stub.ts` (`stubUploadScanner`). The suites in `__tests__/` run the connectors against them; the real
insides run the same suites through the `configure*` hooks — nothing else changes (L3). `platform.uow.test.ts`
runs swap test 9's unit-of-work half over **both** openers.

**PII (01 §4b; 07 §9.2).** `scrubPii` runs on every log line by key (email · name · phone · contact number ·
token · secret · password · authorization · cookie · body · document · address · api/private key · ip ·
user agent · session id — **each also in its plural form**) and by value (`lib/looks-like-pii.ts`: email ·
9–15-digit phone · JWT · provider-key prefix · bearer), strings **and numbers** alike; the same value heuristic
backs `piiSafeString`, the string every event props schema uses. Field names that are ids or names of _things_
(`requestId`, `eventName`, `templateId`, `idempotencyKey`) are on the safe list — log the event name as `eventName`,
never `name`. The three values `consent/types.ts` marks "never logged" (`ipAddress` · `userAgent` · `sessionId`)
are pinned by a test, flat and nested.

**`msg` is scrubbed too (S3b).** A message is prose, not a value, so `log/lib/scrub-message.ts` redacts
`Bearer <token>` pairs, then each whitespace token that reads as PII, then any spaced phone run, then falls back
to `scrubString` (whole-value redaction + truncation). The tracker is handed `line.msg`, so this is what keeps
PII out of Sentry as well as out of stdout. **Put identifiers in `fields`, never in the message** — a 9–15-digit
run inside prose (an epoch stamp, a date written `2026-09-15 08`, the numeric tail of some uuids) reads as a phone
number and is redacted. That is the fail-closed side of the trade; `ts` is a field for exactly this reason.

**What crosses to a client.** `toClientError` reduces `INTERNAL` to its code + a generic message, and for **every**
code runs `lib/safe-details.ts` over `details`, redacting three ways: **by key** (`KEY_PATTERNS.secret` only —
a field named `apiKey` / `token` / `password` / `body` goes whatever its value looks like, because most real
credentials match no value pattern; the `personal` class is _not_ applied, since a client `details` legitimately
names its own field — 01 §4c `details: { mobile: [...] }`), **by value** (the same free-text scrubber the log
message uses, so a key pasted mid-sentence in a provider's message is caught, plus the same number check the log
line applies), and **by shape** (an `Error`, a `Date`, a `Map`, any non-plain object — redacted, never walked,
because `Object.entries` on one silently yields `{}`). `envelopeOf` and `toActionResult` both route their **body**
through it; `envelopeOf`'s `Retry-After` header deliberately reads the raw error, because that header needs the
true number.

**One free-text scrubber, three callers.** `lib/scrub-free-text.ts` is the token-wise pass (`Bearer <token>` pairs
→ each whitespace token through `looksLikePii` → phone runs). `looksLikePii` anchors JWT / provider key / bearer
at the _start_ of a value, so any boundary that sees prose must use the scrubber, not the predicate: the log
message (`scrubMessage`), the client-error guard (`safeDetails`) and the event props guard (`piiSafeString`,
which refuses a value the scrubber would change). Adding a fourth prose boundary means using this, not
`looksLikePii` directly.

**Not here.** `platform/events/client.ts` (`track` → `POST /api/events`) lands with the route (F-c); the
`vercel-analytics` and `meta` sinks land with Phase 4c; `platform/privacy` **is built** (L-009 `3f`, B-46): the Art 17 erasure, both roads and
the sweep. `exportUser` (Art 15, 07 §6.1's last sentence) is deliberately **not** in it — no surface asks for it
yet, and a connector method with no caller is a claim rather than a capability.

<!-- audit
Last edited: 2026-09-17T12:10+10:00 — BB-LDN-Planner-070926/P1-WIRE
Notes: the unit-of-work sub-module (ADR-127): the six uow files moved under `unit-of-work/`, the RPC-boundary opener, the join seam and the one-RPC rule stated with its consequence for the `{ uow }` seams; the boot-wiring table now says what `src/boot/wire-ports.ts` actually installs per port, including the three deliberate fail-closed corners (rate limiter undeclared, event-log reads, the cookie half of consent) and why.
Prior: 2026-09-15T20:05+10:00 — BB-LDN-Planner-070926/S3b
Notes: S3b security fixes documented — the widened sensitive-key set incl. plurals + ip / user agent / session id, numbers content-checked, `msg` scrubbed (and the identifiers-in-fields rule it implies), `safeDetails` on every error code, the rate limiter's production shared-store assertion replacing the silent memory default.
Prior: 2026-09-15T19:10+10:00 — BB-LDN-Planner-070926/S3
Notes: created at S3 — connector table, boot wiring + fail-closed defaults, allowed imports, stubs, PII rules, not-here list.
-->
