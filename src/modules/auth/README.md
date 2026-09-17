# auth

**What it does.** The identity service module (01 §2.4; ADR-069): the session read, the role gate (01 §4d) and the
**data-access port** — the only road any module has to Postgres and Storage (01 §6.3 amended; 03 §1.4). It owns the
Supabase SDK internally and **never exports a client or any driver type**, so a caller's import surface carries no
`@supabase/*` name and `stub-auth` honours the connector trivially (05 §3 rules 1–2). It is a leaf: it imports
`config` and `shared-types` only, and never a business module (01 §2.3).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area                     | Values                                                                                                              | Types (`types.ts`)                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| The gate (03 §1.4)       | `auth` (module binding) · `configureAuth` · `createAuth`                                                            | `Auth` · `Session` · `Role` · `SignInInput` · `SignUpInput` · `AuthErrorDetails`                |
| Data access              | `auth.data.run(op, { uow?, scope? })` · `auth.data.signUrl(ref, ttl)`                                               | `DataAccessPort` · `NamedOperation` · `RunOptions` · `DataScope` · `StorageRef` · `AppDatabase` |
| Drivers                  | `supabaseAuthDriver` (real) · `stubAuth` (`auth.stub.ts`)                                                           | `AuthDriver` · `AuthDeps` (+ `unitOfWork?: UnitOfWorkJoin`) · `DriverUser`                      |
| Route knowledge (01 §4d) | `ROUTE_MAP` · `roleDashboardPath` · `requiredRoleForPath` · `isAuthGroupPath` · `loginRedirectUrl` · `gateDecision` | `GateSession` (`needsPasswordSetup` · `isRecovery`)                                             |
| Pure predicates          | `isParentRole` · `isNannyRole` · `isAdminRole` (+ `auth.isParent/isNanny/isAdmin` on a `Session`)                   | —                                                                                               |

**Errors** (03 §1.4): `UNAUTHENTICATED` · `FORBIDDEN { reason: 'role' | 'mfa' | 'scope' }` · `INTERNAL`
(connection / commit). Every method returns `Result`; nothing throws to a caller (03 §1 rule 4).

**The unit of work (ADR-127 — one RPC is one transaction).** `data.run(op, { uow })` honours a token through a
`UnitOfWorkJoin` (`AuthDeps.unitOfWork`; defaults to `platform`'s module-level `unitOfWorkJoin`, which follows
whatever binding boot installed). The token is judged **before the driver is touched** — one no binding holds
open is refused `INTERNAL { reason: 'unit-of-work-unknown' }` and the operation never runs — and an open one gets
a guarded `Query` (`lib/guard-unit-of-work-query.ts`): exactly one `rpc()`, booked through the join so a second
is refused (`second-rpc-in-unit-of-work`); reads pass; a table `insert` / `update` is refused
(`write-outside-rpc`) because under PostgREST it could never be atomic with the RPC. A refused call reaches the
`NamedOperation` as a thrown `UnitOfWorkRefusal` and comes back out of `run` as the carried `Result` — the one
place a throw becomes a `Result` stays the one place. `stub-auth` takes the same `unitOfWork` option and honours
it identically (03 §11 row 9).

**Boot wiring — and where it deliberately differs from `platform`.** `auth` uses the same registry shape, but the
**default is the real inside, not a fail-closed stub**: the first call to the module-level `auth` binding resolves
to `createAuth({ driver: supabaseAuthDriver() })` and caches it in the registry. `configureAuth` replaces it, and
every method re-reads the registry so a later call wins. `src/boot/wire-auth.ts` (P1-WIRE) installs
`createAuth({ driver: supabaseAuthDriver(), unitOfWork: <the boot binding's join> })` explicitly. There is **no env
name that selects `stub-auth`** (06 §2.5 defines none): the stub is reached by test wiring only.

That is on purpose, and it is the opposite of `platform`'s ports. `platform` fails closed because its ports have
**no** implementation until the S5 schema exists, so anything that "worked" would be a stub succeeding silently.
`auth`'s implementation exists today and needs only env — and `config` throws at import when that env is missing
(01 §4d step 5), so the default cannot quietly run against nothing. With no `src/instrumentation.ts` in this repo
(below), a fail-closed default would simply mean the app has no gate. **There is still no silent success against a
stub:** `stub-auth` is reached only by an explicit `configureAuth(stubAuth(...))`.

**What this module does _not_ do yet (S4 boundaries — see `docs/build-progress.md`).**

- **No rate limiting on the auth surfaces** (07 §8 row 3). `platform`'s `rateLimiter.consume` denies in any
  production-resolved environment (Vercel preview included) until boot declares a **shared** backend, and the
  shared store is the `rate_limit_buckets` table — which **has no specification** (07 §8 names it; 02 §4 / §6
  never create it), so P1-WIRE left the limiter undeclared on purpose. Supabase Auth's own limits stay on meanwhile.

**The passwordless catch and the reset request (ADR-042 · ADR-132 · AUTH-2).** `requestPasswordReset(email)` is the
anonymous half of the catch _and_ S-X-09's forgot half, in one method, because ADR-132 rules that from outside they
must be indistinguishable. It answers the **same `Result` for every address** — known, unknown, passwordless, or a
provider outage — and the only difference is what the account receives: a recovery link for an address the provider
knows, nothing for one it does not. The link lands on `ROUTE_MAP.authCallbackPath` carrying
`next=/reset-password`; an account that has never set a password is then moved on to set-password by the gate's own
step 3, so the catch needs no second email and no account lookup. A provider failure is logged with
`ALERT_PROVIDER_DOWN` and still answers `ok` — surfacing it would restore the enumeration oracle; that reading is
scoped to `lib/request-password-reset.ts` and must not be copied to a write path.

**The recovery email is Supabase's own template, not `comms`** — three reasons, each measured on the trunk, not a
preference: `auth` may import `platform` only (01 §2.3, enforced by `lint:boundaries`), so it cannot reach `comms`;
03 §8.2's 46-id registry names no password-reset or set-password template, and `08.05` already places the auth
emails in the Supabase dashboard; and ADR-136's `Recipient = { userId }` is not implemented — today's `Recipient`
still requires an `email`, so "pass the user id, not an address" has nothing to pass it to. Recorded in the L-007
AUTH-2 entry as a foundations correction.

**The gate's recovery exception (AUTH-2; ADR-132 / 04 §6.1 S-X-09).** `/reset-password` is in
`ROUTE_MAP.authGroupPaths`, which 01 §4d makes signed-out only — and the recovery link arrives _with_ a session, so
until now the one screen the link exists to reach was the one screen it could never reach. `gateDecision` now allows
**one path for one session class**: `session.isRecovery && pathname === ROUTE_MAP.resetPasswordPath`. `isRecovery`
comes from the provider's own `amr` (`readDriverUser`), never from a query string the visitor controls, and it fails
closed with the assurance read. The exception sits **after** step 3, so an account with no password still goes to
set-password. Every other session class is judged exactly as before, and that half is pinned as carefully as the
exception (`__tests__/auth.password-recovery.test.ts`, `int.auth-gate.test.ts`).

**Security scope** (07 §10.1 `auth`, mandatory `security-reviewer`): signup writes the role from a **server** value
and can only ever write a `CustomerRole` (`parent` · `nanny`) — no self-signup path produces `admin` (07 §5.4 row 3);
`admin` additionally requires `mfaVerified` (`aal2`) at `requireRole` (07 §5.4 row 2), so the middleware gate is not
the only check; every `service`-scope use is named here; no `raw_user_meta_data` read after signup (02 §4.1); cookie
flags are `@supabase/ssr`'s defaults plus `SameSite=Lax`, `httpOnly`, `secure` outside development.

**Named `service`-scope (service-role) uses** — 01 §6.3 requires each to be listed and reviewed:

| Call                                                        | Why it must bypass RLS                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `driver.writeRole` (signup)                                 | `user_roles` has no client INSERT policy (02 §4.1); the row is written from a server-side value.                                                                                                                                |
| `driver.writeRole` (`grantRole`)                            | Admin actor only; `user_roles.role` UPDATE has no client policy (07 §5.4 row 3).                                                                                                                                                |
| `data.run(op, { scope: 'service' })`                        | Named jobs and definers only (crons, webhooks, `delete-account`, `retention-sweep`, admin-on-behalf).                                                                                                                           |
| `data.removeObject(ref)` (ADR-155)                          | The undo of an object whose scan or registry write failed (07 §5.3 rule 3): no user role holds DELETE on `verification-documents` (rule 2) and the stack refuses a direct table delete for every role, so the Storage API is called under the service role. Callers: the `verification` upload action only. Logged with the same audit line `run` writes. |
| `platform.events.insert` (`src/boot/db-event-log-store.ts`) | The `event-log` sink: `events` carries no client policy at all (07 §5.2), so the row is written under the service role — 07 §5.1 rule 5 names this use. The envelope was validated by `Events.emit` before it reaches the port. |

**Allowed imports.** `@/modules/config` (client half) · `@/modules/config/server` (the `server-only` second entry
point, `elevated-client.ts` only) · `@/modules/shared-types` · `@/modules/platform` (Result helpers + `log`) ·
`@supabase/ssr` · `@supabase/supabase-js` (types) · `next/server` (types) · `next/headers` (lazily, server only).
No business module, ever (01 §2.3; 05 §7 rule 1).

**Suites.** `src/modules/auth/__tests__/` — `auth.connector.test.ts` (the contract, run twice: real driver double
and `stub-auth`), `auth.route-map.test.ts` (01 §4d prefix table), `auth.password-recovery.test.ts` (ADR-042 / ADR-132 — the reset
request, the no-enumeration property and the gate's recovery exception), `auth.data-port.test.ts` (scopes, the
unit-of-work join — one RPC, a second refused, a write refused, a failing RPC as a `Result` — and `signUrl`), and
`int.auth-gate.test.ts` (05 §4.2 — the middleware gate end to end).

<!-- audit
Last edited: 2026-09-17T12:10+10:00 — BB-LDN-Planner-070926/P1-WIRE
Notes: the unit-of-work join (ADR-127) documented — token judged before the driver, one RPC, writes refused, reads pass, refusal as a Result; boot wiring now names src/boot/wire-auth.ts and the absence of a stub-auth env name; the "no instrumentation.ts" boundary retired; the event-log insert added to the named service-role uses.
Prior: 2026-09-16T11:05+10:00 — BB-LDN-Planner-070926/S4
Notes: initial authoring — the S4 connector (03 §1.4), its fail-closed boot binding, the three S4 boundaries
(no instrumentation.ts, no auth-surface rate limiting, no anonymous passwordless catch) and the named service-scope
uses 01 §6.3 requires.
-->
