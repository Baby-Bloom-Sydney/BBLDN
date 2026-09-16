<!-- PR body — every PR to `main` (CLAUDE.md §2; 05 §9 "merge additionally requires"). A "no" on any of the five blocks merge. -->

## Unit

- **Unit / task:** <!-- e.g. S1 — L-005 -->
- **Branch:** <!-- <purpose>-DDMMYY-N; registered in ../OPERATIONS/BRANCHES.md -->
- **ADRs cited:** <!-- ADR-… (DECISIONS.md) -->
- **Foundations cited:** <!-- doc §section, never restated -->

## The five questions (build-standard §5 — answer each; "n/a — no module code" is valid for docs / CI PRs)

- [ ] 1. Does each new file export exactly one thing?
- [ ] 2. Was the connector (`index.ts` + `types.ts`) written and reviewed before the inside?
- [ ] 3. Could the module be replaced by a stub honouring the connector with nothing else changing?
- [ ] 4. Is every brand / domain / locale / currency / price / flag value read from `config`?
- [ ] 5. Did the ECC review agents run, and are files ≤ 800 / functions ≤ 50 / changed-line coverage ≥ 80 %?

## Review agents run (CLAUDE.md §3 — name each run)

- `code-reviewer`: <!-- result -->
- `typescript-reviewer`: <!-- result -->
- `security-reviewer` / `database-reviewer` / `silent-failure-hunter` (where the recipe requires): <!-- result or n/a -->

## Acceptance rows touched (05 §2) with Verify result

| AC  | Verify | Result |
| --- | ------ | ------ |
| —   | —      | —      |

## Gates (before this push — CLAUDE.md §6)

- [ ] `npm run typecheck && npm run lint && npm test` (+ `npm run build` if structural)
- [ ] `git merge-base --is-ancestor origin/main HEAD` → CURRENT (merged `main` down first)
- [ ] `../OPERATIONS/BRANCHES.md` row current; `docs/build-progress.md` + `CHANGELOG.md` updated
