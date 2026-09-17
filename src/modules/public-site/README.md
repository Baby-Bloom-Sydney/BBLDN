# public-site

**What it does.** The public pages: home, about, the services page, contact, browse, nanny profile and the
legal pages (04 §2.1 `S-X`). Phase 1 `1a` built the chrome (header, footer), the root metadata, the home page
with the quick-match front door, about, the how-it-works stub, the services page, contact, and the route
register that robots and the sitemap are generated from (05 §8.3). `1b` added the area combobox on the front
door, S-X-10 browse, S-X-11 the public profile, the nanny OG image (`01.21`), `GET /api/areas`, and the 02.13
funnel-source parser. A Connect from any public surface goes through `matching`'s one entry point (ADR-126:
`public-site → matching → positions.advance`) — this module never writes a stage.

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`connections`, `matching` (01 §2.3 row). **Never `scheduling`** (03 §3.6 R3).

**Connector.** `PUBLIC_ROUTES` (04 §2.1 as a value, with each screen's metadata copy and its index rule) ·
`isPublicSitePath` · `publicPageMetadata` · `rootMetadata` · `buildRobots` · `buildSitemap` · the three JSON-LD
builders · `parseQuickMatchQuery` (the S-X-01 → S-X-02 query contract) · `parseFunnelQuery` (02.13: `?src` ·
`?lead`) · `parseAreaQuery` (`/api/areas`) · `nannyOgImage` · `sendContactMessageAction` (S-X-23 through
`comms`, template `contact-request-public`, `replyTo` = the submitter) · the components, incl. `BrowseNannies`
(S-X-10) and `NannyProfile` (S-X-11).

**Client-safe by construction.** No component or `lib/` file imports `@/modules/config/server`; the one server
value a screen needs (`AREAS_SOURCE.serviceAreaName`, `SENDERS.support`) is handed in by its route file as a
prop. That is what lets the legacy `MiniFooter` (a client component) import `isPublicSitePath` from the barrel.

**Copy.** Written for London against `00-glossary.md` §6 / P-4. `__tests__/public-site.copy.test.ts` runs the
05 §5.2 word list over every surface this module renders plus the route files it owns. One screen carries a
05 §5.3 row — S-X-10's lead magnet (ADR-056) — applied by screen id from `tests/e2e/words/allowlist.ts`, the same
file the rendered Playwright test reads; every other file passes with no exception.

**Named service-role uses.** None.

**Gaps (recorded, not hidden).**

1. **`GET /api/areas` and `POST /api/public/quick-match` carry no rate limit** (07 §8 row 1) — owed to the unit
   that gives `configureRateLimiter` a shared store, the same debt `/api/health` carries.
2. **The legacy `NannyProfileView.tsx` still sits under `(public)/nannies/[id]/`**: it is marked deprecated and
   nothing public renders it, but `src/app/parent/position/matchmaking/nanny/[id]/page.tsx` (a `1e` / `1g`
   surface) imports it, so it stays until that route is rebuilt.
3. **Eight legacy client components still fetch `/api/sydney-postcodes`** (recorded since S1). Legacy-tree
   files, not this module; the London picker is `matching`'s `AreaCombobox` over `/api/areas`.

<!-- audit
Last edited: 2026-09-17T15:40+10:00 — BB-LDN-Planner-070926/1b
Notes: 1b — combobox on the front door, S-X-10 / S-X-11 / OG rebuilt over `matching`'s read, `/api/areas`, the 02.13 parser; the Connect road restated as ADR-126; gaps rewritten (rate limits, the deprecated view a parent route still imports, the legacy postcode fetches).
Prior: 2026-09-17T10:40+10:00 — BB-LDN-Planner-070926/1a
Notes: 1a — the inside: register, metadata, robots/sitemap, JSON-LD, the quick-match query contract, the contact action, the chrome and five screens; gaps rewritten (view read, areas combobox, OG route).
-->
