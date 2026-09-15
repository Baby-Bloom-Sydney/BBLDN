# build-progress — BabyBloom London (code repo ledger)

> **The repo's own build ledger** (`CLAUDE.md` §9; `08-launch-and-cutover.md` §2.1 step 0 (v); SEQUENCE `14.33`). Must always reflect the true current state so any fresh context resumes perfectly. Updated whenever code state changes; bumped before every compaction (`CLAUDE.md` §8). Task-level tracking lives in `../LDN/OPERATIONS/ACTIVE/L-NNN-…/PROGRESS.md`; merged units are one line each in `CHANGELOG.md`.

---

## Current state

| Field | Value |
|---|---|
| **Trunk (`main`)** | `5db4bf9` — the bootstrap commit: Sydney `nanny-platform/app/` @ `7fd88b1` (T-047 slices 4–5), no history (ADR-006, ADR-061, ADR-107) |
| **Open branch** | `bootstrap-150926-1` — docs, CI, tools (the bootstrap PR; HANDOFF §3.3 (i)–(vi) + §9) |
| **Phase** | Phase 0b — unit **S0** (HANDOFF §11) |
| **Toolchain** | as copied from Sydney: Next 14.2.35 · React 18 · TS 5 · zod 4 · Vitest 4 · Playwright 1 (`package.json`); Next major bump is its own unit after the ADR-104 version row |
| **Database** | none — fresh schema arrives in S5 (`02-data-model.md` §6); no `supabase/` folder in the repo yet |
| **Module tree** | none — `src/modules/` starts in S2; the Sydney tree under `src/` is the **legacy tree** (HANDOFF §3.2) |

## Known bugs

- none recorded. (The raw copy is not expected to be green on every CI check — see "CI status on the raw copy".)

## CI status on the raw copy (HANDOFF §11 S0 — recorded, not hidden)

Checks are the eight protection names (`06-runbook.md` §3.4). Expected on the bootstrap PR:

| Check | Expected | Why | Turns green in |
|---|---|---|---|
| `typecheck` | see `../LDN/OPERATIONS/ACTIVE/L-005-foundations-build-handoff/PROGRESS.md` S0 entry for the measured result | Sydney tree as copied | S1 (Remove sweep must end green) |
| `lint` | red | `prettier --check` over the raw tree; `next lint` result per the S0 PROGRESS entry | S1 |
| `allowed-imports` | red | `scripts/gen-boundary-rules.ts` + `eslint.boundaries.js` do not exist yet | S6 |
| `banned-literals` | red | `scripts/check-config-literals.ts` / `gen-env-example.ts` absent (S2); static banned-words pre-check and the `process.env` grep hit the legacy tree | S2 (scripts) · F-d (sweep) |
| `test` | red | no coverage baseline, no `contract` / `integration` vitest projects, no local Supabase config; e2e needs env | S2–S5; e2e at E1 |
| `build` | see PROGRESS S0 entry | `next build` on the copy; prod-guard boot check needs `purchase-paths` (F-c); `size-limit` config is Phase 1 (05 §8.1 baseline) | S1 (build) · F-c (guard) |
| `types-drift` | red | `src/modules/shared-types/database.types.ts` does not exist; needs `supabase start` + migrations | S2 (file) · S5 (drift) |
| `gitleaks` | scan green (with the recorded allowlist); pin check red | Sydney `package.json` uses `^` ranges; exact-version pinning is a 07 §10.2 gate | S1 |

## Registry (components · actions · modules)

- **Modules:** none yet (`src/modules/` starts in S2 — 26 modules per `00-glossary.md` §3).
- **Legacy tree:** `src/app`, `src/components`, `src/lib`, `src/contexts`, `src/hooks`, `src/types`, `src/middleware.ts` — Sydney as copied; crosses into modules in Phases 1–6 (build-standard §6).
- **CI tooling:** `scripts/ci/*` (see `.github/workflows/ci.yml` header comment for the check → script map).
- **Tools:** `tools/promote-guard.sh` (byte-identical to Sydney; `06-runbook.md` §3.1 inv. 5).

## Files created / modified in the current unit (S0)

| Path | What |
|---|---|
| `CLAUDE.md` | verbatim copy of `../LDN/SPECS/00-foundations/CODE-CLAUDE.md` (CI + `npm run check:claude-md` diff it) |
| `tools/promote-guard.sh` | Sydney's, byte-identical (sha256 in the S0 PROGRESS entry) |
| `docs/build-progress.md` · `CHANGELOG.md` | the two repo ledgers (this file + the merged-units log) |
| `docs/reference/sydney/**` | carried docs `14.04` `14.06` `14.07` `14.13` + `14.14` pointer — reference, not spec |
| `.github/workflows/ci.yml` · `.github/PULL_REQUEST_TEMPLATE.md` | the eight checks (HANDOFF §9; 05 §9) + the five-question PR template (`CLAUDE.md` §2) |
| `scripts/ci/*` | check scripts the workflow calls (each one gate, ≤ 50 lines) |
| `.gitleaks.toml` | recorded false positives (token alphabets) |
| `.gitignore` · `vercel.json` (`lhr1`; two N-2 crons removed) · `package.json` (scripts only) | config |

## Next unit

**S1 — the Remove sweep** (HANDOFF §3.2 table, by SEQUENCE Phase 7 row id) → `npm run typecheck && npm run lint && npm run build` green on the pruned tree; seed `literal-exclusions.json` + `eslint.legacy-paths.json` with the legacy tree. Left for S1 by S0 (full list in the S0 PROGRESS entry): the Sydney share surfaces (N-3 rows `02.19`–`02.21`, `10.14`), the remaining Sydney crons in `vercel.json`, `README.md` (Sydney's — `14.06` rejig), exact-version pinning.

---

<!-- audit
Last edited: 2026-09-15T13:55+10:00 — BB-LDN-Planner-070926/S0
Notes: seeded at bootstrap (S0) — trunk = 5db4bf9; no known bugs; next unit S1.
-->
