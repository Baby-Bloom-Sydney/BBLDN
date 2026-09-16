# areas

**What it does.** The one geography source for London (03 §6.1; T-4.4, ADR-029): area name + postcode district +
centroid ("Clapham, SW4"). The table _is_ the service area (T-4.1, ADR-028) — there is no second list, no zone and
no borough filter. It holds reference data only and never writes a profile, position or lead. Full postcodes are
never captured: `normaliseDistrict` discards a pasted inward code (03 §6.3 rule 1).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area                 | Values                                       | Types (`types.ts`)                                     |
| -------------------- | -------------------------------------------- | ------------------------------------------------------ |
| The provider         | `areas` (module binding) · `configureAreas`  | `AreasProvider` · `Area` · `Coordinates` · `AreaTable` |
| Geography vocabulary | —                                            | `PostcodeDistrict` · `AreaLabel` · `AreaResult`        |
| Providers            | `stubAreas` (`areas.stub.ts` = `stub-areas`) | —                                                      |
| Pure helpers         | `formatAreaLabel` · `normaliseDistrict`      | `AreaErrorDetails`                                     |

Methods (03 §6.2): `searchAreas` · `lookupArea` · `isInServiceArea` · `centroid` · `distanceKm` · `listAll`.
`searchAreas`, `listAll` and `isInServiceArea` never fail for user input (`[]` / `false`); the rest return
`Result`.

**Errors** (03 §6.3): district not in the table → `NOT_FOUND { reason: 'not-in-table', district }`; not an
outward-code shape → `VALIDATION { reason: 'not-an-outward-code', field: 'district' }`; no provider configured →
`INTERNAL { reason: 'areas-not-configured' }`. No `PROVIDER_ERROR` day one.

**What it may import.** `config` · `shared-types` · `platform` — and nothing else. `areas` is a service module
(01 §2.3, §2.4; ADR-069) and `platform` is the kernel it may reach (ADR-116). No business module, ever.

**Boot wiring — and the gap this unit leaves.** The module-level `areas` binding reads a registry that
`configureAreas` fills, and it **fails closed** until it is filled: `lookupArea` / `centroid` / `distanceKm`
answer `INTERNAL { reason: 'areas-not-configured' }`. `searchAreas` / `listAll` / `isInServiceArea` have no
`Result` in the contract, so unconfigured they return `[]` / `false` — the one quiet corner of this seam, stated
here rather than hidden.

Nothing calls `configureAreas` yet. The selection 03 §6.3 specifies (`AREAS_SOURCE.provider: "db" | "stub"`,
`config/areas-source.ts`) belongs in `src/instrumentation.ts`, which this repo still does not have (S4's
recorded gap, blocked on the transaction-opener ADR). Until then a caller — or a test — configures the provider
itself.

**What this module does _not_ do yet (F-a boundaries).**

- **No `db-areas`.** The database-backed provider reads the `areas` table, which arrives with migration `0001`
  (HANDOFF §11). `stub-areas` is the only provider here, and it is production code, not a fixture.
- **No `GET /api/areas` route and no autocomplete component.** The eight dark legacy autocompletes
  (`docs/build-progress.md` — known gaps) are re-pointed at this connector by F-d, not here.
- **No seed CSV.** The dataset licence and the full Greater London coverage are 03 §12 items 23 / 24, owned by the
  `02` seed migration.

**Suites.** `src/modules/areas/__tests__/areas.swap.test.ts` — swap test 5 (03 §11), parameterised over the
providers so `db-areas` joins it by name alone: the contract's shapes, `distanceKm("SW4","SW4") === 0`,
`isInServiceArea("XX99") === false`, `searchAreas` under two characters, the fail-closed unconfigured seam and
the two pure helpers.

<!-- audit
Last edited: 2026-09-16T14:10+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, `stub-areas` and swap test 5. Recorded boundaries: no `db-areas`
(migration `0001`), no boot call to `configureAreas` (no `src/instrumentation.ts`), no route or component.
-->
