# platform

**What it does.** The cross-cutting service module (01 §2.4; ADR-069) every other module imports: `log` (01 §4b),
`Events` + the `ConsentReader` seam (01 §7; 03 §9), the `Result` helpers + the `ErrorCode` → HTTP map (01 §4a), the
API envelope for route handlers and the serialisable action result (01 §4c / §4e), `withUnitOfWork` + the opaque
`UnitOfWork` token (01 §6.3; 03 §1.4), `platform/consent` (02 R-4; 07 §2.6 / §2.7(a) / §2.9), the rate limiter
(07 §8) and the upload-scan interface (07 §5.3 rule 3; ADR-106). It holds no business rule and no table of its own.

**Connector.** `index.ts` re-exports `types.ts` and, per 01 §2.5, the three named sub-modules' connectors
(`log/` · `events/` · `consent/`) plus `rate-limit/` and `upload-scan/`:

| Area              | Values                                                                                                                                                                  | Types (in `types.ts` / `<sub>/types.ts`)                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Result (01 §4a)   | `ok` · `err` · `fromThrown` · `toClientError` · `statusForCode`                                                                                                         | `ClientResult` · `ThrownContext`                                                                                             |
| Envelope (01 §4c) | `envelopeOf` (pure) · `toResponse` (route handler) · `toActionResult` (server action)                                                                                   | `Envelope` · `SuccessEnvelope` · `ErrorEnvelope` · `PageMeta` · `EnvelopeOptions` · `EnvelopePayload`                        |
| Unit of work      | `withUnitOfWork` · `currentUnitOfWork` · `createUnitOfWork(opener)` · `configureUnitOfWork` · `memoryTransactionOpener`                                                 | `TransactionOpener<H>` · `UnitOfWorkBinding<H>` · `MemoryTransaction*`                                                       |
| Clock + ids       | `nowInstant` · `newId<T>()` — the one place a branded id is minted                                                                                                      |                                                                                                                              |
| `log/`            | `log` · `configureLog` · `createLogger` · `consoleSink` · `scrubPii` · `ALERT_NAMES` · `nullErrorTracker` · `sentryErrorTracker` · `resolveErrorTracker`                | `Log` · `LogLine` · `LogFields` · `LogLevel` · `AlertName` · `LogSink` · `ErrorTracker` · `ErrorCaptureFn` · `LogFormat`     |
| `events/`         | `Events` · `configureEvents` · `createEvents` · `EVENT_SCHEMAS` · `validateEmitInput` · `isClientEventName` · `memorySink` · `consoleEventSink` · `memoryEventLogStore` | 03 §9.2 verbatim: `EventEnvelope` · `EmitInput` · `Sink` · `SinkId` · … · `EventsConnector` · `EventLogStore` · `EventsDeps` |
| `consent/`        | `consent` · `configureConsent` · `createConsent` · `CONSENT_PURPOSES` · `memoryConsentStore` (`consent.stub.ts`)                                                        | `Consent` · `ConsentReader` · `ConsentStore` · `ConsentPurpose` · `RecordConsentInput` · … · `ConsentErrorDetails`           |
| `rate-limit/`     | `rateLimiter` · `configureRateLimiter` · `createRateLimiter` · `policyWindows` · `memoryRateLimitStore`                                                                 | `RateLimiter` · `RateLimitStore` · `RateLimitPolicy` (= config `RateLimit`) · `RateLimitDetails` · `RateLimitAllowance`      |
| `upload-scan/`    | `uploadScanner` · `configureUploadScanner` · `stubUploadScanner` (`upload-scan.stub.ts`)                                                                                | `UploadScanner` · `ScanInput` · `ScanResult` · `ScanVerdict` · `UploadScanDetails`                                           |

**Boot wiring — the `configure*` hooks.** `platform` stays a leaf (03 §9.5 / §12 item 31): the real ports are
injected once at boot (`src/instrumentation.ts`, S4 / F-c) and by test wiring. Until then every module-level
connector **fails closed** except the two whose stub _is_ the day-one implementation:

| Connector        | Unconfigured default                                                                        | Boot installs                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `withUnitOfWork` | `INTERNAL { reason: 'unit-of-work-not-configured' }`                                        | `createUnitOfWork(opener)` — `auth`'s opener over its data client (S4)                            |
| `log`            | usable: pretty console outside production, JSON in production, null tracker                 | `configureLog({ format, tracker: resolveErrorTracker({ dsn: env.server.SENTRY_DSN, capture }) })` |
| `Events`         | store refuses writes — one `warn` per emit (no uow) / the caller's transaction fails (uow)  | `createEvents({ store, sinks, log, consent })` — event-log store over `auth`'s port (S5 `events`) |
| `consent`        | `INTERNAL { reason: 'consent-not-configured' }` — `hasMarketing` included (no pixel / CAPI) | `createConsent({ store, cookieExpiryDays, onCookieConsent, log })` (S5 consent tables)            |
| `rateLimiter`    | **memory store** — the dev implementation; per instance until `rate_limit_buckets` (07 §8)  | `createRateLimiter({ store, log, burstAlertMultiple })` over the shared store                     |
| `uploadScanner`  | **the stub** — ADR-106's day-one scanner (MIME allow-list + size cap from `config/uploads`) | the Phase 2 product via `configureUploadScanner`                                                  |

**What it may import.** `@/modules/config` (the client-safe connector — never `@/modules/config/server`) and
`@/modules/shared-types` only (01 §2.3 / §2.4; pinned by `platform.repo.test.ts`), plus `zod` and `node:async_hooks`.
`events/types.ts` augments `EventPropsMap` by `declare module "@/modules/shared-types/events"` (the file the
interface lives in — declaration merging needs the declaring module, not the barrel; S6's boundary lint must allow
that one `declare module` target). The module is **client-safe**: it reads no server env; the boot code resolves
`SENTRY_DSN` and hands the tracker in.

**Named service-role uses.** None inside this module — the ports that reach Postgres (`EventLogStore`,
`ConsentStore`, `RateLimitStore`, `TransactionOpener`) are implemented by the boot code over `auth`'s data port,
which names its own service-role uses (07 §5.1 rule 5: the `event-log` sink and `recordCookieConsent` are named there).

**Stubs (05 §3 rule 1 — production code, one export, inside the module).** `memoryTransactionOpener` ·
`memorySink` · `memoryEventLogStore` · `consent.stub.ts` (`memoryConsentStore`) · `memoryRateLimitStore` ·
`upload-scan.stub.ts` (`stubUploadScanner`). The suites in `__tests__/` run the connectors against them; the real
insides (S4 / S5) run the same suites through the `configure*` hooks — nothing else changes (L3).

**PII (01 §4b; 07 §9.2).** `scrubPii` runs on every log line by key (email · name · phone · token · secret ·
password · authorization · cookie · body · document · address · api/private key) and by value
(`lib/looks-like-pii.ts`: email · 9–15-digit phone · JWT · provider-key prefix · bearer); the same value heuristic
backs `piiSafeString`, the string every event props schema uses. Field names that are ids or names of _things_
(`requestId`, `eventName`, `templateId`, `idempotencyKey`) are on the safe list — log the event name as `eventName`,
never `name`.

**Not here.** `platform/events/client.ts` (`track` → `POST /api/events`) lands with the route (F-c); the
`vercel-analytics` and `meta` sinks land with Phase 4c; `platform/privacy.exportUser` (07 §6.1) is Phase 3.

<!-- audit
Last edited: 2026-09-15T19:10+10:00 — BB-LDN-Planner-070926/S3
Notes: created at S3 — connector table, boot wiring + fail-closed defaults, allowed imports, stubs, PII rules, not-here list.
-->
