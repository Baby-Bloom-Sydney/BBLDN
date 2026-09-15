# build-progress — BabyBloom London (code repo ledger)

> **The repo's own build ledger** (`CLAUDE.md` §9; `08-launch-and-cutover.md` §2.1 step 0 (v); SEQUENCE `14.33`). Must always reflect the true current state so any fresh context resumes perfectly. Updated whenever code state changes; bumped before every compaction (`CLAUDE.md` §8). Task-level tracking lives in `../LDN/OPERATIONS/ACTIVE/L-NNN-…/PROGRESS.md`; merged units are one line each in `CHANGELOG.md`.

---

## Current state

| Field              | Value                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Trunk (`main`)** | `5db4bf9` — the bootstrap commit: Sydney `nanny-platform/app/` @ `7fd88b1` (T-047 slices 4–5), no history (ADR-006, ADR-061, ADR-107). **Not yet pushed** (needs BAI's OK).                                                                                                                                                                |
| **Open branches**  | `bootstrap-150926-1` @ `4e993e0` — docs, CI, tools (the bootstrap PR; awaiting BAI). **`remove-sweep-150926-1`** — unit **S1**, branched **off `bootstrap-150926-1`** (not `main` — one-time exception, `[decision]` in the L-005 PROGRESS S1 entry; rebased onto `main` once the bootstrap PR merges). Head sha in the S1 PROGRESS entry. |
| **Phase**          | Phase 0b — unit **S1 done locally**; next unit **S2** (HANDOFF §11)                                                                                                                                                                                                                                                                        |
| **Toolchain**      | as copied from Sydney, now **pinned exactly**: Next 14.2.35 · React 18.3.1 · TS 5.9.3 · zod 4.3.6 · Vitest 4.1.5 · Playwright 1.59.1 (`package.json`); the Next major bump is its own unit after the ADR-104 version row                                                                                                                   |
| **Database**       | none — fresh schema arrives in S5 (`02-data-model.md` §6); no `supabase/` folder in the repo yet                                                                                                                                                                                                                                           |
| **Module tree**    | none — `src/modules/` starts in S2; the pruned Sydney tree under `src/` is the **legacy tree** (HANDOFF §3.2), listed in `literal-exclusions.json` + `eslint.legacy-paths.json`                                                                                                                                                            |
| **Tree size**      | 1 018 tracked files (S0: 1 030) — S1 removed 140, moved 3, added 7 (`docs/s1-remove-ledger.md`)                                                                                                                                                                                                                                            |

## Known bugs / gaps (recorded, not hidden)

- **Suburb autocompletes are dark until F-a.** `/api/sydney-postcodes` went with N-5 (HANDOFF §3.2; the table is never created on the fresh DB, so the route could not have answered anyway). Eight legacy client components still `fetch` it and swallow the 404 into an empty list (`N1Location`, `QuickMatch`, `InlineQuickMatch`, both `SuburbAutocomplete`s, `AddressPickerDialog`, `ContactSection`, `OnboardingVerificationClient`); four server files still query `sydney_postcodes` (matching engine ×2, quick-match, admin-positions). Re-pointed at the London `areas` endpoint by F-a + F-d (Rejig rows `12.01` `02.06` `03.11` `03.27`). Raised by silent-failure-hunter at S1 review; kept per the §3.2 contract, listed here so it is not silent.
- **No path to nanny level 4 until Phase 2b.** With the NSW WWCC methods removed (N-4), nothing transitions `wwcc_status` past `pending`; cross-check / "fully verified" are unreachable until the DBS certificate + Update Service step lands (`05-*` NEW row, Phase 2b). Expected in Phase 0b (no verification wizard ships before 2b), recorded so 2b starts from it.
- **`src/app/api/admin/pipeline-snapshots/route.ts` is ungated** (pre-existing Sydney code, not touched by S1; found by security-reviewer at S1 review): no auth check, service-role client, `middleware.ts` only refreshes the session. Fixed when F-c replaces the `/api/admin/*` shells with fail-closed routes (`int.routes`); until then it must not be deployed anywhere public (nothing is deployed yet).
- **`public/katie-manifest.json` churns on every build** (`prebuild` stamps `generated_at`). S1 committed one regeneration so the Katie route allowlist reflects the pruned tree; do not commit later timestamp-only diffs. Candidate for S2: generate at build only and ignore the file.
- Dead `Link`s on Phase 1 Rejig surfaces: 7 × `/parent/matchmaking` (04.07 page removed), `/api/validate-wwcc-pdf` fetch in the onboarding wizard (2b), `/nanny/interviews` + `/parent/interviews` nowhere linked any more. Strings only; listed in `docs/s1-remove-ledger.md`.

## CI status after S1 (measured locally 2026-09-15; the eight protection names — `06-runbook.md` §3.4)

| Check             | Local result                                                                                                                                                                                                                                                                  | Turns green in                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `typecheck`       | **green** — `tsc --noEmit` 0 errors                                                                                                                                                                                                                                           | —                                    |
| `lint`            | **green** — `next lint` 0 errors (pre-existing Sydney warnings only, none added by S1) · `prettier --check .` green (`.prettierignore` for generated / reference paths + `CLAUDE.md`) · `check:claude-md` green                                                               | —                                    |
| `allowed-imports` | red — `scripts/gen-boundary-rules.ts` + `eslint.boundaries.js` do not exist yet (`eslint.legacy-paths.json` seeded)                                                                                                                                                           | S6                                   |
| `banned-literals` | red — `check-config-literals.ts` / `gen-env-example.ts` absent (`literal-exclusions.json` seeded); static banned-words pre-check 654 legacy lines; `process.env` grep 151 legacy reads                                                                                        | S2 (scripts) · F-d (sweep)           |
| `test`            | unit **green** — vitest **1337 / 1337** (114 files); whole-repo line coverage 44.98 % (gated from Phase 2); `diff-cover` needs `origin/main` + pip (CI only); no `contract` / `integration` vitest projects; no local Supabase; e2e needs env                                 | S2–S5 (projects) · E1 (e2e)          |
| `build`           | `next build` **green** with the workflow's placeholder env (230 → fewer chunks; bundle string scan green) · `size-limit` config is Phase 1 · **prod-guard red** (Sydney boots with `stub-stripe`)                                                                             | F-c (guard) · Phase 1 (budgets)      |
| `types-drift`     | red — `src/modules/shared-types/database.types.ts` does not exist; needs `supabase start` + migrations                                                                                                                                                                        | S2 (file) · S5 (drift)               |
| `gitleaks`        | **green** — git-mode scan clean with `.gitleaks.toml` · `check:pins` **green** (every dependency exact; lockfile refreshed, `npm ci` clean) · `check:audit` **green** with the expiring allow-list (16 entries → 2026-10-15; owners: ADR-104 Next unit / S2 lockfile refresh) | allow-list retires with ADR-104 + S2 |

## Registry (components · actions · modules)

- **Modules:** none yet (`src/modules/` starts in S2 — 26 modules per `00-glossary.md` §3).
- **Legacy tree:** `src/app`, `src/components`, `src/lib`, `src/contexts`, `src/hooks`, `src/types`, `src/middleware.ts` — Sydney as copied **minus the S1 Remove sweep** (`docs/s1-remove-ledger.md`); crosses into modules in Phases 1–6 (build-standard §6).
- **S1 additions:** `src/lib/chat/modules/job-match-prose.ts` (the two prose helpers that survived `bsr-translator`) · `src/components/nanny/{NannyCardBK,NannyMatchCardBK,ExpandableBadges}.tsx` (moved from the `brandkit1` dev route; used by `/parent/browse` + `BrowseNanniesTab`) · `scripts/ci/check-audit.mjs` + `scripts/ci/audit-allowlist.json` · `literal-exclusions.json` · `eslint.legacy-paths.json` · `.prettierignore`.
- **CI tooling:** `scripts/ci/*` (see `.github/workflows/ci.yml` header comment for the check → script map; sec job now runs `npm run check:audit`).
- **Tools:** `tools/promote-guard.sh` (byte-identical to Sydney; `06-runbook.md` §3.1 inv. 5).

## Files created / modified in the current unit (S1)

Per-commit detail in `docs/s1-remove-ledger.md` (summary table + appendix). Commits on `remove-sweep-150926-1`, oldest first: N-1 babysitting · N-2 payouts / Connect / ABN · N-3 sharing + `02.22` hard-off · N-4 WWCC / OCG · N-5 Sydney geography · parent verification (ADR-071) · Cloudinary · dev / test surfaces + analytics · superseded (04.07, 04.15) · pins + lockfile · README + seeds · `style(s1): prettier` · `ci(s1)` audit allow-list · review fixes + ledger · this ledger update.

## Next unit

**S2 — `shared-types` (types only) + `config/*` + `config/env.ts` + `.env.example` generator + `config.env` suite** (HANDOFF §5, §11). Before S2 starts: BAI OKs the push of both branches, the bootstrap PR merges, **S1 is rebased onto the merged `main`** (it was branched off `bootstrap-150926-1`), the S1 PR opens and merges with BAI's OK on the recorded reds. S2 must know: the legacy tree is pinned and formatted; `literal-exclusions.json` / `eslint.legacy-paths.json` exist as plain JSON arrays of globs for its scripts to read; `check:audit` expects the transitive lockfile refresh (brace-expansion, flatted, js-yaml, minimatch, nanoid, picomatch, protobufjs, undici, vite, ws) by 2026-10-15; `vercel.json` still carries the 13 kept Sydney crons until `config/crons.ts` regenerates it; the manifest churn above.

---

<!-- audit
Last edited: 2026-09-15T15:20+10:00 — BB-LDN-Planner-070926/S1
Notes: S1 shipped locally — Remove sweep on remove-sweep-150926-1 (off bootstrap-150926-1); typecheck / lint / build / vitest green; known gaps recorded; next unit S2.
Prior: 2026-09-15T13:55+10:00 — BB-LDN-Planner-070926/S0 (seeded at bootstrap).
-->
