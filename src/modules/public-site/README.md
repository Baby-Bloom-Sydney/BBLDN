# public-site

**What it does.** The public pages: home, about, the services page, contact, browse, nanny profile and the
legal pages (04 §2.1 `S-X`). Phase 1 `1a` built the chrome (header, footer), the root metadata, the home page
with the quick-match front door, about, the how-it-works stub, the services page, contact, and the route
register that robots and the sitemap are generated from (05 §8.3). It owns the browse **Connect** action (K-1)
through the `connections` stage-model connector, never by writing a stage itself — B-39 (DECISIONS §2) is open,
so that action is not built.

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms`,
`connections`, `matching` (01 §2.3 row). **Never `scheduling`** (03 §3.6 R3).

**Connector.** `PUBLIC_ROUTES` (04 §2.1 as a value, with each screen's metadata copy and its index rule) ·
`isPublicSitePath` · `publicPageMetadata` · `rootMetadata` · `buildRobots` · `buildSitemap` · the three JSON-LD
builders · `parseQuickMatchQuery` (the S-X-01 → S-X-02 query contract `1b` reads) · `sendContactMessageAction`
(S-X-23 through `comms`, template `contact-request-public`, `replyTo` = the submitter) · the components.

**Client-safe by construction.** No component or `lib/` file imports `@/modules/config/server`; the one server
value a screen needs (`AREAS_SOURCE.serviceAreaName`, `SENDERS.support`) is handed in by its route file as a
prop. That is what lets the legacy `MiniFooter` (a client component) import `isPublicSitePath` from the barrel.

**Copy.** Written for London against `00-glossary.md` §6 / P-4. `__tests__/public-site.copy.test.ts` runs the
05 §5.2 word list over every surface this module renders plus the route files it owns, and passes with no
allowlist row — none of these screens carries a scoped exception. The 05 §5.3 allowlist lives at
`tests/e2e/words/allowlist.ts` for the rendered Playwright test.

**Named service-role uses.** None.

**Gaps (recorded, not hidden — detail in the L-007 PROGRESS entry for `1a`).**

1. **S-X-10 / S-X-11 (browse, profile) are not rebuilt.** The foundations put a parent's only road to a nanny
   behind the `nanny_public` view, and `auth`'s `Query` port types `from()` over `keyof Tables` only — a view
   has no road through the port. Widening `shared-types` + `auth` is a contract change (amend 03 §1.4 first)
   and both modules are always-sequential; left for the planner. The legacy Sydney pages stay in place.
2. **No `/api/areas`, no area combobox yet** — the front door takes area + district as two labelled inputs;
   the ARIA 1.2 combobox over the areas table lands with `1b`.
3. **OG image route (`01.21`)** still reads Sydney tables through the legacy action; it needs the same nanny
   read as gap 1.
4. **Eight legacy client components still fetch `/api/sydney-postcodes`** (recorded since S1). Legacy-tree
   files, not this module.

<!-- audit
Last edited: 2026-09-17T10:40+10:00 — BB-LDN-Planner-070926/1a
Notes: 1a — the inside: register, metadata, robots/sitemap, JSON-LD, the quick-match query contract, the contact action, the chrome and five screens; gaps rewritten (view read, areas combobox, OG route).
-->
