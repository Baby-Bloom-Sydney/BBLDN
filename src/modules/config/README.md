# config

**What it does.** The single constants / config layer (01 §3; build-standard L4; ADR-033): brand, domain, senders,
URLs, currency, locale, timezone, area source, prices, offer values, flags, scheduling / matching / connections /
vetting seed values, Meta event map, test-user domain, crons, security controls, upload caps, app / Katie / launch
values, and the typed environment. **Every file exports one frozen `as const` value** (build-standard L1; the config
tests count the exports). Values come from the foundations, never invented; a value BAI has not yet ruled carries
`@pending:B-nn` (DECISIONS §2 "default running now") and a Sydney-carried seed carries `[unverified]`.

**Two connectors.**

| Import                    | Who                                        | What                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/modules/config`        | anything, including client components      | everything that reads no server env — `BRAND` · `LOCALE` · `DOMAIN` · `URLS` · `PRICES` · `OFFER` · `SCHEDULING` · `MATCHING` · `CONNECTIONS` · `VETTING` · `META_EVENTS` · `TEST_USER_DOMAIN` · `CRONS` · `SECURITY` · `UPLOADS` · `APP` · `LAUNCH` · `publicEnv` · `PUBLIC_FLAGS` |
| `@/modules/config/server` | server files only (`import "server-only"`) | the above plus `env` · `FLAGS` · `SENDERS` · `AREAS_SOURCE` · `KATIE`                                                                                                                                                                                                               |

Why two: `env.ts` must carry `import "server-only"` (01 §3.3) and the server names must never reach a client chunk
(07 §7 item 3 — the bundle string scan). A single barrel re-exporting `env` would put every server name into any client
component that imported `BRAND`. The boundary lint (S6) allows `@/modules/config/server` as the module's second entry
point — recorded in the L-005 S2 PROGRESS entry as a `[decision]`.

**The two `process.env` readers.** `env.ts` is the one reader for server code (all 50 names, parsed once, missing or
malformed → `EnvInvalidError` naming names only, `ALERT_ENV_INVALID`). `public-env.ts` reads only the
`NEXT_PUBLIC_*` names + `NODE_ENV`, each as a literal property access so Next.js inlines them at build time — the only
way a client bundle can hold a public value. The config.env suite asserts that `public-env.ts` reads nothing else and
that no other file under `src/modules/**` touches `process.env`; `scripts/ci/check-env-reads.mjs` enforces it repo-wide.

**The env registry** is `lib/env-schema.ts` — names, scope, kind, purpose, D / P / Pr marks (06 §2.5). `.env.example`
is generated from it (`npm run env:example`; `env:check` fails CI on drift). `.env.test` is the placeholder-only
fixture the suite parses (05 §4.3); the CI workflow's `env:` block mirrors it.

**Crons.** `crons.ts` states every 01 §4f cron in Europe/London; `npm run crons:generate` writes the `vercel.json`
cron block, `crons:check` fails on drift (06 §4.1 C). UTC hour = London hour (fires at H GMT / H+1 BST, same London
date).

**`uploads.ts` vs `security.ts`.** Both exist (01 §3.1 lists both); `UPLOADS` holds the bucket MIME lists and caps,
`SECURITY.uploads` references it so the security controls are still reviewed as one unit (07 §7 rule 6).

**What it may import.** Nothing outside the module (01 §2.3 — leaf). Files import each other (`scheduling` reads
`LOCALE`, `senders` reads `env`); unions that mirror `shared-types` (`EvidenceType`, `BucketKey`) are restated in
`types.ts` and pinned equal by the tests.

**Named service-role uses.** None.

<!-- audit
Last edited: 2026-09-15T17:10+10:00 — BB-LDN-Planner-070926/S2
Notes: created at S2 — two connectors (universal / server), two readers (env / public-env), registry-generated .env.example, crons → vercel.json.
-->
