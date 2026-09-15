# BabyBloom London — code repo

The application repo for BabyBloom London. **Read [`CLAUDE.md`](./CLAUDE.md) first** — it is the
process contract for every session (reads, laws, ECC rules, branch + deploy, ledgers). Every project
fact (brand, domain, prices, areas, flags, schema, journeys) lives in the foundations at
`../LDN/SPECS/00-foundations/` (linked sibling checkout — ADR-107), never here.

## Where things are

| What | Where |
|---|---|
| Process rules, laws, ECC, branch/deploy | [`CLAUDE.md`](./CLAUDE.md) |
| The foundations (facts + ADRs) | `../LDN/SPECS/00-foundations/` — start at its `README.md`, then `DECISIONS.md` |
| Build state, known bugs, next unit | [`docs/build-progress.md`](./docs/build-progress.md) |
| Merged units | [`CHANGELOG.md`](./CHANGELOG.md) |
| Team coordination (tasks, branches, protocols) | `../LDN/OPERATIONS/` (`INDEX.md`, `BRANCHES.md`, `PROTOCOLS/`) |
| S1 Remove-sweep ledger (what left the Sydney copy, and why) | [`docs/s1-remove-ledger.md`](./docs/s1-remove-ledger.md) |
| Carried Sydney docs — reference, not spec | `docs/reference/sydney/` |

## Run it

```bash
npm ci
npm run dev          # http://localhost:3000 — needs a .env (names: 06-runbook.md §2.5; generated in S2)
npm run gates        # typecheck · lint · unit tests · CLAUDE.md = CODE-CLAUDE.md
npm run build        # next build (placeholder env as in .github/workflows/ci.yml)
```

The eight CI checks and the scripts behind them are listed in the header of
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml). Never push, merge, deploy or promote without
BAI's explicit OK for that action (`CLAUDE.md` §3, §6).
