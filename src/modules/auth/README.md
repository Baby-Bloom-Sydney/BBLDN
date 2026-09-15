# auth

**What it does.** The identity service module (01 §2.4; ADR-069): the session read, the role gate (01 §4d) and the
**data-access port** — the only road any module has to Postgres and Storage (01 §6.3 amended; 03 §1.4). It owns the
Supabase SDK internally and **never exports a client or any driver type**, so a caller's import surface carries no
`@supabase/*` name and `stub-auth` honours the connector trivially (05 §3 rules 1–2). It is a leaf: it imports
`config` and `shared-types` only, and never a business module (01 §2.3).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area                     | Values                                                                                             | Types (`types.ts`)                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| The gate (03 §1.4)       | `auth` (module binding) · `configureAuth` · `createAuth`                                           | `Auth` · `Session` · `Role` · `SignInInput` · `SignUpInput` · `AuthErrorDetails`                |
| Data access              | `auth.data.run(op, { uow?, scope? })` · `auth.data.signUrl(ref, ttl)`                              | `DataAccessPort` · `NamedOperation` · `RunOptions` · `DataScope` · `StorageRef` · `AppDatabase` |
| Drivers                  | `supabaseAuthDriver` (real) · `stubAuth` (`auth.stub.ts`)                                          | `AuthDriver` · `AuthDeps` · `DriverUser`                                                        |
| Route knowledge (01 §4d) | `ROUTE_MAP` · `roleDashboardPath` · `requiredRoleForPath` · `isAuthGroupPath` · `loginRedirectUrl` | —                                                                                               |
| Pure predicates          | `isParentRole` · `isNannyRole` · `isAdminRole` (+ `auth.isParent/isNanny/isAdmin` on a `Session`)  | —                                                                                               |

**Errors** (03 §1.4): `UNAUTHENTICATED` · `FORBIDDEN { reason: 'role' | 'mfa' | 'scope' }` · `INTERNAL`
(connection / commit). Every method returns `Result`; nothing throws to a caller (03 §1 rule 4).

**Boot wiring.** `auth` follows `platform`'s registry pattern: the module-level `auth` binding **fails closed**
with `INTERNAL { reason: 'auth-not-configured' }` until boot calls
`configureAuth(createAuth({ driver: supabaseAuthDriver() }))`. There is no silent success against a stub.

**What this module does _not_ do yet (S4 boundaries — see `docs/build-progress.md`).**

- **No `src/instrumentation.ts`.** Every port the boot file must configure (`configureUnitOfWork`,
  `configureEvents`, `configureConsent`, `configureRateLimiter`) needs either the S5 schema or the unresolved
  transaction-opener decision; wiring `memoryTransactionOpener` in its place would turn `platform`'s deliberate
  fail-closed into a silent success against a stub. Recorded, not guessed.
- **No rate limiting on the auth surfaces** (07 §8 row 3). `platform`'s `rateLimiter.consume` denies in any
  production-resolved environment (Vercel preview included) until boot declares a **shared** backend, and the
  shared store is the S5 `rate_limit_buckets` table. Supabase Auth's own limits stay on meanwhile (07 §8 row 3).
- **No anonymous passwordless catch** (AC-X-14). 01 §4d step 3 — a _signed-in_ user with no password → set-password
  — is implemented (`needsPasswordSetup`). The login-form half, where an anonymous visitor types a known
  passwordless email, needs a named lookup 02 §7 does not define plus an account-enumeration ruling; raised as a
  foundations gap in the L-005 S4 entry rather than invented.

**Security scope** (07 §10.1 `auth`, mandatory `security-reviewer`): signup writes the role from a **server** value
and can only ever write a `CustomerRole` (`parent` · `nanny`) — no self-signup path produces `admin` (07 §5.4 row 3);
`admin` additionally requires `mfaVerified` (`aal2`) at `requireRole` (07 §5.4 row 2), so the middleware gate is not
the only check; every `service`-scope use is named here; no `raw_user_meta_data` read after signup (02 §4.1); cookie
flags are `@supabase/ssr`'s defaults plus `SameSite=Lax`, `httpOnly`, `secure` outside development.

**Named `service`-scope (service-role) uses** — 01 §6.3 requires each to be listed and reviewed:

| Call                                 | Why it must bypass RLS                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `driver.writeRole` (signup)          | `user_roles` has no client INSERT policy (02 §4.1); the row is written from a server-side value.      |
| `driver.writeRole` (`grantRole`)     | Admin actor only; `user_roles.role` UPDATE has no client policy (07 §5.4 row 3).                      |
| `data.run(op, { scope: 'service' })` | Named jobs and definers only (crons, webhooks, `delete-account`, `retention-sweep`, admin-on-behalf). |

**Allowed imports.** `@/modules/config` (client half) · `@/modules/config/server` (the `server-only` second entry
point, `elevated-client.ts` only) · `@/modules/shared-types` · `@/modules/platform` (Result helpers + `log`) ·
`@supabase/ssr` · `@supabase/supabase-js` (types) · `next/server` (types) · `next/headers` (lazily, server only).
No business module, ever (01 §2.3; 05 §7 rule 1).

**Suites.** `src/modules/auth/__tests__/` — `auth.connector.test.ts` (the contract, run twice: real driver double
and `stub-auth`), `auth.route-map.test.ts` (01 §4d prefix table), `auth.data-port.test.ts` (scopes, `uow`,
`signUrl`), and `int.auth-gate.test.ts` (05 §4.2 — the middleware gate end to end).

<!-- audit
Last edited: 2026-09-16T11:05+10:00 — BB-LDN-Planner-070926/S4
Notes: initial authoring — the S4 connector (03 §1.4), its fail-closed boot binding, the three S4 boundaries
(no instrumentation.ts, no auth-surface rate limiting, no anonymous passwordless catch) and the named service-scope
uses 01 §6.3 requires.
-->
