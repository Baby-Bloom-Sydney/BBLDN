# CLAUDE.md — BabyBloom London (code repo)

> **Seed file.** This document lives at `LDN/SPECS/00-foundations/CODE-CLAUDE.md` and is copied **verbatim** to `<ldn-repo>/CLAUDE.md` at repo bootstrap (`08-launch-and-cutover.md` §2.1 step 0 — Code repo bootstrap; gate A0). It holds **process rules and pointers only** — never a project fact. Every fact is a `doc §section` reference into the foundations, so this file can never disagree with them. If you find a fact here, it is a defect: move it to the owning doc and leave a pointer.

This repository is the application whose brand, domain, senders, URLs, currency, locale, timezone, areas, prices and flags are all read from the `config` module (`01-architecture.md` §3) — none of them are literals in code, and none are stated in this file. The **foundations** — the nine numbered documents plus `DECISIONS.md` — are the single source of truth for what this app is and does. **Amend the doc first:** if the code needs something a foundation does not say, the foundation is edited (new section or ADR) *before* the code is written; code that contradicts a foundation is wrong until the foundation changes (`README.md` §4 rule 2).

**Where the foundations are.** Throughout this file `FOUNDATIONS` means `../SPECS/00-foundations/` — i.e. the `LDN` planning tree checked out as a **sibling** of this repo. At bootstrap (`08-launch-and-cutover.md` §2.1 step 0) one of two shapes is chosen and **recorded as an ADR in `DECISIONS.md`**: **(a) linked — the default** — the repo sits beside `LDN/` and every relative path resolves as written; **(b) vendored** — the numbered docs + `DECISIONS.md` are copied read-only into `<ldn-repo>/docs/foundations/` and re-synced at every task boundary, with the originals in `LDN/` remaining canonical. **That ADR governs every `../` path in this file** — `../SPECS/00-foundations/` *and* `../OPERATIONS/` (INDEX, PROGRESS, PROTOCOLS, BRANCHES) alike: if vendored, the ADR also states how each `../OPERATIONS/…` path resolves (sibling checkout of the workspace repo, or a recorded alias); no path in this file may be left unresolved. Either way: edits go to the `LDN/` originals, never to a vendored copy.

---

## 1. FIRST 30 SECONDS — before any other work

You may be one of several Claude sessions, sub-agents and BAI himself active on this repo at once. Coordination happens through the LDN OPERATIONS layer, not through this repo. Reads, in order:

1. **This file** — the process rules.
2. **`FOUNDATIONS/README.md`** — the file index and the **ownership matrix** (§2): which doc § owns each topic.
3. **`FOUNDATIONS/DECISIONS.md`** — the ADR register; read the header rules and the **newest rows** (bottom of §1) plus the open decisions (§2). A decision that binds your work is cited by ADR id in your PR body.
4. **The OPERATIONS task you were pointed at** — `../OPERATIONS/INDEX.md` lists active tasks (`L-NNN` ids); the task's `PROGRESS.md` is the soft lock: claim before work, sign every edit, update on every status change (`../OPERATIONS/PROTOCOLS/MULTI-AGENT-ETIQUETTE.md`, `SIGN-OFF-FORMAT.md`).
5. **Your handle** = the renameable Claude Code session name BAI has set (`../OPERATIONS/PROTOCOLS/HANDLE-CONVENTION.md`). Ask BAI if you don't know it; use it on every commit, footer and log line.
6. **`docs/build-progress.md`** in this repo (§9 below) — current code state, known bugs, exact next unit.

Then: confirm you are a **coding agent** working from a handoff doc (`../OPERATIONS/PROTOCOLS/PLANNING-VS-IMPLEMENTATION.md`). Planning sessions do not write code in this repo.

---

## 2. The five laws — merge-blocking

From `TARGET/build-standard/README.md` §2 (ADR-007). A "no" on any acceptance question blocks the merge.

| # | Law | Merge-blocking rule in this repo |
|---|---|---|
| L1 | **One function per file** | A file exports exactly one thing: one action, one component, one helper, one type group. No `utils` grab-bags. Checked by the boundary lint (`05-acceptance-and-test-plan.md` §7). |
| L2 | **Connectors first** | A module's `index.ts` + `types.ts` are written and reviewed **before** its inside. Where the mechanism is undecided, the connector ships with a stub (`*.stub.ts`) that honours it (`03-interface-contracts.md` §1). |
| L3 | **Swap without breaking** | Delete the module folder, drop in a stub honouring `index.ts`, the app still builds and runs. The swap tests are the acceptance (`03-interface-contracts.md` §11; `05-acceptance-and-test-plan.md` §3). |
| L4 | **Config, not literals** | Brand, domain, senders, URLs, currency, locale, timezone, area source, prices, feature flags — read from `config` only (`01-architecture.md` §3.2 rule 1). A literal outside `src/modules/config/` fails the config-literal test (`05-acceptance-and-test-plan.md` §6). |
| L5 | **Full ECC, every time** | §3 below, unabridged. |

**The five-question acceptance test** (build-standard §5) — answered in every PR body, every review:

1. Does each new file export exactly one thing?
2. Was the connector (`index.ts` + `types.ts`) written and reviewed before the inside?
3. Could the module be replaced by a stub honouring the connector with nothing else changing?
4. Is every brand / domain / locale / currency / price / flag value read from `config`?
5. Did the ECC review agents run, and are files ≤ 800 / functions ≤ 50 / changed-line coverage ≥ 80 %?

Copied Sydney code is split to one-function-per-file and swept for literals **as it arrives**, module by module, never as a big-bang refactor (build-standard §6; `01-architecture.md` §3.2 rule 3).

---

## 3. The vital few — this section IS the standard

ECC's full rule set is written for a funded team with a review budget. This is one person with no revenue and a hard token ceiling. What follows is the 80/20: the rules that actually caught defects across Phases 0–3, and nothing else.

**How to read this.** Directions, not a compliance checklist. Broad adherence across all of them beats rigid obedience to any one — a rule followed without regard to the task at hand is how a build gets slow and expensive without getting safer. If a line conflicts with the actual goal of the work in front of you, the goal wins: say which line you set aside and why, in one sentence, and carry on. **Do not grow this section** — when something needs to hold, write a gate; when it applies to one task, it belongs in that task's brief.

**Do not read `~/.claude/rules/`. Do not read `DECISIONS.md`, the review registers, or another phase's `PROGRESS.md`.** Your brief carries the decisions you need. If it does not, ask for them — do not go looking.

### The six rules

Ordered by yield, derived from what actually found the defects in Phases 0–3. The canonical copy is the **`ecc-lite` skill** (`~/.claude/skills/ecc-lite/SKILL.md`); this section must not drift from it.

1. **Prefer a gate to a rule.** If you want something enforced, write the check. A rule in prose is read by every agent for ever and obeyed sometimes; a gate is paid for once and obeyed always.
2. **Prove it by running it, never by reading it.** Nearly every critical defect here was found by invoking the thing — a privileged function called as the wrong role, a real submission raising on a real payload, a deletion that left nothing behind. Reading the same code found none of them.
3. **Compare what is declared against what is used.** Anything configured, granted, exported or documented that nothing calls is a defect, not tidiness. Fifteen rate-limit policies with four surfaces unprotected; sixty-nine tables granted and five ever narrowed.
4. **Test first, and never bend a test to the code.** Write the failing test, watch it fail, then make it pass. Where code and a document disagree **the document wins**: pin the documented behaviour as a failing test and name its owner.
5. **Fail closed.** Unknown, unconfigured or refused denies rather than allows.
6. **One thing per file; cross-module imports through the connector; no secret in the repo.**

### Three from ECC that earn their place

7. **Research and reuse before writing** (ECC `development-workflow` §0) — search for an existing implementation, library or pattern first. A speed rule, and the cheapest thing in ECC.
8. **Finish what you delegate** (ECC `agents`) — your final message is the deliverable; never end a turn with spawned work still running.
9. **Speak severity** (ECC `code-review`) — CRITICAL blocks, HIGH warns, MEDIUM and LOW are recorded.

### Parallelism

Parallelise **work**, never **opinions**. Agents building modules that share no files: yes, same tokens and less wall-clock. Two or more agents reviewing the same diff: no. Bound by budget and genuine independence, not a fixed cap; push after every commit so a cut costs nothing.

### Time box

A unit is **20–40 minutes**. Past an hour you are either doing three units' work or reading what you were not asked to read. Say so and stop rather than pressing on. **It is a smell, not a budget:** it never justifies skipping rule 2 — running the thing is what finds the defect, so if verification is what takes you over the hour, go over and say so.

### Review — when, and only then

| Situation | Run |
|---|---|
| Ordinary build work | **nothing** — no `code-reviewer`, no `typescript-reviewer`, no `silent-failure-hunter` |
| Your diff touches auth, money, personal data, children's data, or a privilege/grant | **one** `security-reviewer` pass |
| You wrote a migration | **one** `database-reviewer` pass |
| End of a phase | **one** sweep, run by the planner, not by you — and its fixes are not themselves swept |

Nothing else spawns an agent. Two units in flight at most, one while limits are tight.

### Reading budget

This file · `docs/build-progress.md` · the `README.md` of each module you touch · the exact document sections your brief names. That is the whole list.

### Model

**Opus for everything**, including work the plans mark `[Fable]`. Fable only when the planner names it in the brief and says why. This holds until BAI says otherwise.


## 4. Where things are decided — pointer table

One topic → one owning `doc §` (`FOUNDATIONS/README.md` §2). Cite these; never restate them.

| Topic | Owner |
|---|---|
| Vocabulary — stages, movers, modules, ID schemes, voice, names, canonical terms, fates | `00-glossary.md` (§1 stages · §2 movers · §3 modules · §4 screen IDs · §5 decision IDs · §6 voice · §7 names · §8 canonical terms · §9 fates + principles) |
| Runtime + hosting, env names | `01-architecture.md` §1 |
| Module map + allowed imports; service modules; folder shape | `01-architecture.md` §2 (§2.1 map · §2.3 allowed-imports table · §2.4 service modules · §2.5 folder shape) |
| Config layer — files, rules, env schema, feature flags | `01-architecture.md` §3 (§3.2 rules · §3.3 loading · §3.4 flags) |
| Error handling, logging, API envelope, auth gate, actions vs routes, crons | `01-architecture.md` §4 (§4a–§4f) |
| Data + storage boundaries; `auth` data-access port; `UnitOfWork` | `01-architecture.md` §6 (§6.3 data clients) |
| Analytics seam | `01-architecture.md` §7 |
| Enums, tables by cluster, not-created list, migration order, RPCs/views, buckets | `02-data-model.md` (§3 enums · §4 tables · §5 not created · §6 migration order · §7 RPCs + views · §8 buckets) |
| How contracts work; `auth` connector + unit of work | `03-interface-contracts.md` §1 (§1.4) |
| Stage-model contract; slice registration; `call-layer` connector | `03-interface-contracts.md` §2 (§2.1 · §2.5 signature · §2.7) |
| Scheduling contract | `03-interface-contracts.md` §3 |
| Swappable connectors — `vetting-providers` · `purchase-paths` · `areas` · `scoring/distance` · `comms/sms` | `03-interface-contracts.md` §4 · §5 · §6 · §7 · §8 (one section each) |
| Events / analytics taxonomy | `03-interface-contracts.md` §9 |
| Cross-contract table; swap tests | `03-interface-contracts.md` §10 · §11 |
| Screen-ID register; parent / nanny / admin journeys; screen inventory; copy anchors | `04-journeys-and-screens.md` (§2 register · §3–§5 journeys · §6 inventory · §8 copy) |
| Acceptance criteria (`AC-P` · `AC-N` · `AC-A` · `AC-X` · `AC-Y`) | `05-acceptance-and-test-plan.md` §2 |
| Test pyramid, suites, fixtures; CI pipeline + merge blocks | `05-acceptance-and-test-plan.md` §4 · §9 |
| Banned-words test · config-literal test · module-boundary lint | `05-acceptance-and-test-plan.md` §5 · §6 · §7 |
| NFRs — performance, a11y, SEO | `05-acceptance-and-test-plan.md` §8 |
| Environments; `.env.example` inventory | `06-runbook.md` §2 (§2.5) |
| Branch + promote; deploy runbook; rollback | `06-runbook.md` §3 · §4 · §5 |
| Backup / restore, RTO / RPO; monitoring; day-one manual ops; support | `06-runbook.md` §6 · §7 · §8 · §9 |
| Funnel metrics | `06-runbook.md` §10 |
| Data classification; threat model; RLS intent + bucket policies | `07-security-and-data-protection.md` §3 · §4 · §5 |
| Retention / deletion; secrets; rate limiting; breach duties | `07-security-and-data-protection.md` §6 · §7 · §8 · §9 |
| Security review gates, CI security items, headers / CSP | `07-security-and-data-protection.md` §10 |
| Launch sequence, supply plan, go / no-go, cutover | `08-launch-and-cutover.md` §2 · §3 · §5 · §7 |
| Decisions (ADRs) + open decisions | `DECISIONS.md` §1 · §2 |
| Build laws, module map origin, acceptance test | `TARGET/build-standard/README.md` §2 · §3 · §5 |

If a topic is not in this table, look it up in `FOUNDATIONS/README.md` §2 (the ownership matrix is the authority; this table mirrors it and is re-synced whenever the matrix changes). If it is in neither, it is undecided: raise it in the task's `PROGRESS.md` and, if KEY, in `../OPERATIONS/INDEX.md` "Open KEY decisions".

---

## 5. Module rules in the repo

The module rules are **not restated here** — these are the rules; read them there. Every one is merge-blocking through the boundary lint and swap tests (§2). Pointers only:

| Rule | Owner |
|---|---|
| Allowed imports between modules | `01-architecture.md` §2.3 |
| Service modules are leaves (`auth` · `comms` · `areas` · `platform`) | `01-architecture.md` §2.4 (ADR-069) |
| Folder shape — `index.ts` · `types.ts` · `actions/` · `components/` · `lib/` · `__tests__/` · `README.md` | `01-architecture.md` §2.5; build-standard §4 |
| Action / route rules — validate once at the boundary, `Result<T>` + error registry, `UnitOfWork` as opaque token | `01-architecture.md` §4a |
| Data clients — `auth` never exports a driver client or type | `01-architecture.md` §6.3 |
| How contracts work; `auth` connector + unit of work | `03-interface-contracts.md` §1 (§1.4) |
| Stage model — `advance()`, slices, registration | `03-interface-contracts.md` §2.1 |
| Scheduling — who may import it | `03-interface-contracts.md` §3 |
| Boundary lint (deep imports, one export per file) | `05-acceptance-and-test-plan.md` §7 |

Where one of these sections marks an item as open (e.g. slice-registration shape, `03-interface-contracts.md` §12 / `01-architecture.md` §10), it is **undecided until its ADR lands in `DECISIONS.md`** — do not infer a default from this file.

---

## 6. Branch, deploy, promote

Governed by `06-runbook.md` §3 (five invariants §3.1 · three human safeguards §3.2 · lifecycle §3.3 · branch protection §3.4) and §4 (deploy runbook). Origin: Sydney's `website/system/OPERATIONS/PROTOCOLS/BRANCH-AND-DEPLOY.md`, written after the 2026-06-01 non-fast-forward promote silently reverted 252 files. London makes it mechanical from day one. In one screen:

1. **One trunk: `main`** = what is live = the base every branch starts from.
2. **Own branch, own worktree, off the *current* `main`**; branch name `<purpose>-DDMMYY-N`. Register it in `../OPERATIONS/BRANCHES.md` before building; read that file first for overlap. That file is created at bootstrap (`08-launch-and-cutover.md` §2.1 step 0); **if it is absent, stop and create it from the Sydney pattern** (`website/system/OPERATIONS/BRANCHES.md`) before branching.
3. **Push continuously.** Unpushed work does not exist.
4. **Merge `main` DOWN before merging UP;** then `git merge-base --is-ancestor origin/main HEAD && echo CURRENT || echo STALE` — STALE means go back to step 4.
5. **Promote only `main`, fast-forward-only**, via `tools/promote-guard.sh <live-sha> <candidate-sha> <repo>` (exit 0 or STOP). Branch protection on `main` is **on from day one** (required checks, up-to-date rule, no force-push — `06-runbook.md` §3.4).
6. **Explicit BAI OK** for *this* merge / push / preview / promote — every time.

Gates before every push: `npm run typecheck && npm run lint && npm test` (+ `npm run build` if structural). Commit shape: `06-runbook.md` §4.3 (conventional commit `type(<module>): …`, London admin git identity, **no attribution trailers**). Migrations: BAI applies, one OK per file (§4.2). Preview + smoke: §4.4. Promote + verify: §4.5. Rollback: §5.

---

## 7. Efficiency rules

**Context loading.** Every task: this file + `docs/build-progress.md` + the `README.md` of each module you touch. Stop there unless the task needs more.

- **Bug fix:** the broken file only; check `build-progress.md` Known bugs first.
- **New action / component:** the owning module's `README.md` + `index.ts` + `types.ts`, plus the closest existing sibling as reference. Not unrelated modules.
- **Styling:** the file being styled only.
- **Auth / middleware:** `auth`'s connector (`01-architecture.md` §4d, §6.3) + the middleware gate. Nothing else.
- **Schema:** `02-data-model.md` + `07-security-and-data-protection.md` §5. Nothing else from the foundations.
- **Contract change:** the owning section of `03-interface-contracts.md` — amend the doc first (preamble of this file; `README.md` §4 rule 2).
- **Do not read** `../STOCKTAKE/`, `../TRIAGE/`, `../TARGET/` (except build-standard) or Sydney's `website/` unless the handoff points you there. They are history and reference, not spec.

**Response style.** Don't narrate; do it. Don't echo file contents after editing — path + what changed. Minimal change for a bug fix; no drive-by refactors.

**Agent strategy.** Classify, then go. **Small** (1–5 files or any bug fix): sequential, no agents. **Large** (6+ new independent files): 2–3 agents max, no shared files, each reads this file + `build-progress.md` + its own files only. **Always sequential:** bug fixes, refactors, shared files (`config`, `shared-types`, `platform`, `auth`, layouts), anything order-dependent, schema. Agent failure → stop all, continue sequentially from the last working state.

**Dependency awareness.** Before creating a component, action, helper or config key: check the module `README.md`, `build-progress.md`'s registry and `config` — no duplicates. Before installing a package: check `package.json`.

---

## 8. Compaction protocol

Compact only at a logical breakpoint, never mid-task. Before every compaction:

1. `docs/build-progress.md` — files created / modified (full paths + what changed), current bugs, registry, **exact next unit to pick up**.
2. The task's `PROGRESS.md` in `../OPERATIONS/` — a "compacting context now; resume here" log entry, signed with your handle.
3. Audit footers bumped on every file you edited (`../OPERATIONS/PROTOCOLS/SIGN-OFF-FORMAT.md`).
4. **Commit everything** (`COMMIT-DISCIPLINE.md`) — `ops(L-NNN): pre-compaction snapshot` is fine.
5. After compaction: re-read §1–§3 of this file, then `build-progress.md`.

---

## 9. Build ledger

Three ledgers, each updated whenever code state changes; a task is not done until all three say so.

| Ledger | Where | What goes in |
|---|---|---|
| `docs/build-progress.md` | this repo | files created / modified, component + action registry, known bugs, next unit. Must always reflect the true current state so any fresh context resumes perfectly. |
| `CHANGELOG.md` | this repo | one line per merged unit, newest at top, `type(<module>): …` + PR + ADRs cited. |
| `PROGRESS.md` | `../OPERATIONS/ACTIVE/L-NNN-…/` | claim, status, log entries with handle + offset timestamp; mirrored in `INDEX.md`; closed tasks roll into `../OPERATIONS/CHANGELOG.md`. |

Both in-repo ledgers are seeded at bootstrap (`08-launch-and-cutover.md` §2.1 step 0). **If `docs/build-progress.md` or `CHANGELOG.md` is absent, create it from the `_project-template` shape** (`projects/_project-template/`; Sydney's `BB/nanny-platform/docs/04-technical/build-progress.md` is the reference for the build ledger) **before the first commit** — a commit with no ledger entry is a process violation.

Two repos, two commits: code lands in this repo; docs, PROGRESS and foundation amendments land in the workspace repo.

---

## 10. What never goes in this file

- Project facts: table names, column names, enum values, screen IDs, routes, template ids, event names.
- Prices, currency, locale, timezone, brand, domain, sender addresses, URLs, flag names or values.
- Copy, voice, banned words.
- Decisions — they are ADRs in `DECISIONS.md`; this file may cite an ADR id, never restate its content.
- Provider names or credentials, environment values, project ids.
- Anything already owned by a foundation section — link it (§4), don't repeat it.

If a fact is needed here to make a rule readable, the rule is written as a pointer instead. When a foundation section number changes, only §4 of this file changes.

---

## Precedence

1. **This file, §3** — the vital few. It **replaces** `~/.claude/rules/` for this repo (BAI's ruling, 2026-09-23). Do not read the rules directory; if something in it matters, it is either in §3 or it is a gate.
2. **The rest of this file** — code-repo process rules.
3. `FOUNDATIONS/*` — what the app is (facts); they win over any code comment or README in this repo.
4. `../OPERATIONS/PROTOCOLS/*` — team protocols referenced from here.
5. Per-task handoff docs — task-specific notes.

Sydney's `website/` CLAUDE.md chain is reference only; it does not govern this repo. Conflicts go to `../OPERATIONS/INDEX.md` "Open KEY decisions" for BAI.

---

<!-- audit
Last edited: 2026-09-23T11:45+10:00 — BB-LDN-Planner-070926
Notes (F9, review fix pass): preamble bootstrap moment → 08 §2.1 step 0 / gate A0; linked-vs-vendored ADR governs ALL ../ paths (foundations + OPERATIONS), default linked; §5 reduced to pointers only (01 §2.3–2.5 / §4a / §6.3; 03 §1.4 / §2.1 / §3; 05 §7), restated rules + unratified slice-registration default removed; §6 BRANCHES.md created at bootstrap, else stop + create from Sydney pattern; §9 seed build-progress / CHANGELOG from _project-template shape before first commit; §4 fallback keeps README §2 as authority.
Previous: Notes: §3 replaced by the vital few — BAI's ruling of 2026-09-23: ECC boiled to the 80/20, no rules-directory reading, no mid-build review agents, a 20-40 minute time box, Opus for everything. Earlier: §3 checkpoint table gains the ADR-142 row (action/route units carry one security-reviewer pass; declared-and-uncalled controls fail a gate). Earlier: initial authoring (L-004 wave 4) — code-repo CLAUDE.md seed: pointers + process only; five laws as merge blocks + five-question test; ECC hard rules; pointer table mirroring README §2 with real section numbers from 00–08 + DECISIONS + build-standard; module rules (folder shape, boundary lint, service leaves, auth no-client, UnitOfWork token, slice registration default pending 03 §12 item 35 / 01 §10 O-12, scheduling importers); branch/deploy/promote condensed from 06 §3–§4 with Sydney origin; efficiency + compaction (portable half of Sydney's nanny-platform CLAUDE.md); three build ledgers; never-list; precedence. Bootstrap decisions flagged: linked vs vendored foundations; slice-registration shape.
-->
