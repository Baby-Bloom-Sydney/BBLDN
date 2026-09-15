> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Planning → Building Handoff: V 1.1 A-08 + Side Fixes

**Created:** 2026-05-08
**From:** Planning workspace (Bailey + Claude planner)
**To:** Implementing coding agent
**Workspace:** `system/APP/Ammendments/V 1.1/`

---

## Sign-off (REQUIRED)

The implementing agent must populate both blocks below. **Read sign-off goes in BEFORE any code is written. Completion sign-off goes in AFTER all deliverables ship.**

### Block 1 — Read acknowledgment

- [ ] I have read this handoff document end-to-end.
- [ ] I have read every doc listed in the READ ORDER section below.
- [ ] I understand the deliverables, the quality bar, and the constraints.
- [ ] I have asked any clarifying questions before starting.

**Read timestamp (UTC, ISO 8601 — `YYYY-MM-DDTHH:MM:SSZ`):** ___________________

**Agent identity / session:** ___________________

### Block 2 — Completion acknowledgment

- [ ] All four deliverables in the DELIVERABLES section below have shipped (or, for Side fix 3, the investigation report has been delivered).
- [ ] All quality-bar criteria in the QUALITY BAR section have been met.
- [ ] PROGRESS.md (in V 1.1 folder) has been updated for each shipped sub-piece with commit hash, scope decisions, and verification notes.
- [ ] All ECC review agents listed in the ECC DISCIPLINE section have run on the relevant surfaces with HIGH + CRITICAL findings closed before commit.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build` are all green.
- [ ] Manual smoke test on a real device passed for nanny + parent variants.
- [ ] e2e-runner Playwright tests added for the full onboarding cascade end-to-end.

**Completion timestamp (UTC, ISO 8601):** ___________________

**Agent identity / session:** ___________________

**Final commit hash on `feat/katie-phase-1-foundation` (or successor branch):** ___________________

---

## DELIVERABLES (the implementing agent must ship all of these to count as complete)

### Deliverable 1 — A-08 main onboarding cascade (PRIMARY)

The Katie-guided onboarding flow per `A-08-katie-guided-onboarding.md`. Specifically:

- New module file: `app/src/lib/chat/modules/child-onboarding.ts`
  - Module id: `child-onboarding` (NOT `onboarding` — collision with existing parent-side module).
  - Declares the `child.created` proactive trigger.
  - Declares the system prompt fragment that loads only during onboarding (drops out when `onboarding_completed = true`).
  - Inherits Katie's existing personality framework — does NOT override or duplicate.
- Module registry update: `app/src/lib/chat/modules/registry.ts` — one import + one array entry.
- Server-side trigger dispatch in `app/src/lib/actions/bapp/child-clients.ts`:
  - On `createChild` success: synchronously create the celebration tile via `create_tile`.
  - Synchronously dispatch `child.created` proactive event.
  - Both must succeed atomically with child creation.
- Parent-side trigger dispatch on `connect_child_invite` server action: dispatch `parent.connected_to_child` proactive event.
- Proactive dispatcher registration: `app/src/lib/chat/proactive/dispatcher.ts` — register `child.created` + `parent.connected_to_child` as recognised events.
- Per-topic state object on `bloombot.settings` JSONB:
  - `onboarding_completed` (boolean)
  - `onboarding_dismissed` (boolean)
  - `onboarding_state` (object with `started_at`, `last_active_at`, `current_step`, `topics` map per spec)
- New tool (recommended): `update_onboarding_state(topic, status, summary?)` for explicit state updates by Katie.
- "Continue setup with Katie" banner in `app/src/components/bapp/BAppFeedView.tsx` — state-aware copy per spec.
- Both nanny + parent variant cascades implemented per spec prompts.
- Subsequent-children variant (returning-user welcome) implemented.
- Resume mechanism: banner click + natural-language re-trigger ("set me up", etc.).
- Error handling for every failure mode listed in spec § "Error handling + graceful degradation".

### Deliverable 2 — Side fix 1: Milestone codes leak (APPROVED, SHIP)

Fix the leak where users see raw milestone IDs (e.g. `CL_12_18_1`) in progress drafts.

- Root cause: `app/src/components/bapp/tiles/ProgressTile.tsx:54` falls back to `update.id` when `milestoneMap` is missing. `app/src/components/katie/tiles/DraftTile.tsx:446` renders ProgressTile WITHOUT passing `milestoneMap`.
- Fix: thread `milestoneMap` from DraftTile down to ProgressTile (preferred) AND/OR change the fallback to a user-safe placeholder as a defensive measure regardless of fix path.
- Add a regression test asserting no raw milestone IDs (matching `^[A-Z]{2,3}_\d+_\d+_\d+$`) appear in any DraftTile or ProgressTile rendered output.
- Verify: every progress-update draft Katie creates renders human-readable descriptions only.

### Deliverable 3 — Side fix 2: Streaming fix OR spoof fallback (EITHER OUTCOME APPROVED)

Fix the "3 dots → block of text" streaming behaviour.

- Diagnostic phase (per spec):
  - Server-side: log each SSE chunk's length + timestamp before `controller.enqueue` in `/api/chat/route.ts`.
  - Client-side: log each `text` event's arrival timestamp + content length in `use-chat-stream.ts`.
  - Confirm whether the issue is at Gemini (large chunks), HTTP buffering (Vercel/Next.js), or React rendering.
- If real streaming is tractable: ship the fix per the diagnosis. Likely interventions: stream headers (`X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`), Gemini SDK streaming options, response chunked-transfer-encoding verification.
- If real streaming is non-tractable: ship the **client-side typewriter spoof** per spec — render text character-by-character at 30-60 chars/sec, never freeze mid-word, respect `prefers-reduced-motion: reduce`.
- Either outcome is Bailey-approved. Choose based on diagnostic findings + implementation cost.

### Deliverable 4 — Side fix 3: Latency investigation REPORT (DO NOT CHANGE CODE)

Per Bailey: *"the latency issue must be investigated, not just outright changed without permission. because I may not like potential trade-offs."*

- Produce a written report at `system/APP/BLOOMBOT/audits/latency-investigation-{YYYY-MM-DD}.md`.
- Report must measure + document:
  1. Cache hit rate for `cachedContent` (sample size, % hits, sample of cache-key-divergence reasons if misses are common).
  2. Prompt size — total assembled-prompt bytes, per-section breakdown.
  3. Tool-roundtrip overhead — per-turn breakdown for 5-10 representative conversations (rounds, tool calls, wall-time per round vs per tool).
  4. Model variant comparison — same 5-10 prompts run through Pro and Flash, raw outputs attached, quality assessment + speed delta.
  5. TTFT vs total response time per response.
- Report must include candidate fixes, trade-offs per fix, and a recommended priority order.
- **NO code changes.** Bailey reviews the report + selects which fixes (if any) to apply in a follow-up work unit.
- Latency work must NOT be bundled into A-08 or side-fix commits — keep it isolated.

---

## QUALITY BAR (every item below must be true to claim "complete")

### Code quality
- [ ] Files ≤ 800 lines, functions ≤ 50 lines (per `common/coding-style.md`).
- [ ] No `any` in application code — use `unknown` + narrow (per `typescript/coding-style.md`).
- [ ] Immutable updates only — never mutate (per `common/coding-style.md`).
- [ ] No `console.log` in shipped code.
- [ ] No hardcoded secrets, no security regressions.

### Testing
- [ ] 80%+ test coverage on new code (per `common/testing.md` mandatory rule).
- [ ] TDD-first workflow: failing test → minimum implementation → refactor → 80%+ verified.
- [ ] Unit tests on the `child-onboarding` module's tools + handlers.
- [ ] Integration tests on the proactive dispatch path (createChild → tile + trigger → Katie's bot receives event).
- [ ] e2e Playwright tests for full nanny + parent onboarding flows.
- [ ] Regression test for milestone-leak fix.
- [ ] AI-regression-testing skill applied — Katie's output stability verified across the streaming/spoof change.

### CI gates
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run typecheck` — 0 errors.
- [ ] `npm test` — all tests pass.
- [ ] `npm run build` — strict prod build succeeds.

### Manual verification
- [ ] Real-device smoke test on iPhone Safari (320, 375 widths).
- [ ] Full nanny flow: createChild → celebration tile appears → welcome arrives → cascade runs → state updates correctly → wrap displays direct link → onboarding_completed flag flips.
- [ ] Full parent flow: invite claim → parent.connected_to_child fires → parent lands on Katie deck → guided tour with real inline tiles → completion.
- [ ] Resume flow: skip cascade at welcome → banner appears → click → resume from current_step → completion.
- [ ] Subsequent children flow: second createChild → lightweight welcome variant → cascade runs.
- [ ] Milestone-leak fix: every progress draft renders descriptions only, no raw IDs.
- [ ] Streaming or spoof: text appears progressively, not as a block. Verified on real device.

### Documentation
- [ ] PROGRESS.md updated per shipped piece (commit hash, ship notes, scope decisions, verification line).
- [ ] doc-updater run after main work — CODEMAPS + module-registry doc updated.
- [ ] comment-analyzer pass on the new module file + system prompt fragment.

### ECC reviews (HIGH + CRITICAL findings closed before commit)
- [ ] code-reviewer
- [ ] typescript-reviewer
- [ ] silent-failure-hunter (proactive dispatch path — MANDATORY)
- [ ] type-design-analyzer (onboarding_state union — MANDATORY)
- [ ] a11y-architect (banner, tile changes, streaming/spoof bubble — MANDATORY)
- [ ] security-reviewer (any new server actions)
- [ ] database-reviewer (JSONB read/write patterns)
- [ ] performance-optimizer (streaming + latency surfaces)
- [ ] pr-test-analyzer (test coverage real, not tautological)

---

## READ ORDER (don't skip — ALL must be read before sign-off)

1. **This document** — `system/APP/Ammendments/V 1.1/planning2building-handoff.md` (you're reading it).
2. **V 1.1 README** — `system/APP/Ammendments/V 1.1/README.md` — orientation + status.
3. **A-08 spec** — `system/APP/Ammendments/V 1.1/A-08-katie-guided-onboarding.md` — ~1100 lines, dense but complete. Read once for shape, then again as you implement. Don't skip the "In-scope side fixes" section.
4. **Constitutional layer:**
   - `system/APP/BLOOMBOT/PROMPTS/RULES/PRINCIPLES.md` — invariants, never violate.
   - `system/APP/BLOOMBOT/PROMPTS/RULES/ANTI-PATTERNS.md` — banned behaviours, never re-add.
   - `system/APP/BLOOMBOT/PROMPTS/PROPOSED-EDITS.md` — flags a future personality protocol revision (no auto welcome-back). NOT your task — out of scope, but read so you know.
5. **Katie architecture:**
   - `system/APP/BLOOMBOT/MODULES.md`
   - `system/APP/BLOOMBOT/PROACTIVE-MESSAGES.md`
   - `system/APP/BLOOMBOT/TOOLS.md`
   - `system/APP/BLOOMBOT/LAYOUT.md`
   - `system/APP/BLOOMBOT/BRANDING.md`
6. **Voice ground truth** — `app/src/lib/chat/prompts/seed-data.ts` — the `personality` section. A-08 INHERITS this; do NOT override.
7. **Project ECC discipline** — `BB/nanny-platform/CLAUDE.md` — full ECC discipline expectations + agent catalogue + parallel-invocation rule.

---

## KEY CONSTRAINTS

- This is an INTRODUCTION TO THE SERVICE, not a data-collection wizard. Nothing in the cascade is required. Skipping is never a failure state.
- Use Katie's full capability — do NOT pre-constrain to lower tiers to optimise cost. Cost discipline is explicitly DEFERRED for v1.
- Module id MUST be `child-onboarding` (NOT `onboarding` — there's an existing module called `onboarding` for parent position-creation coaching that would collide).
- Compose existing primitives. New keys go in existing `bloombot.settings` JSONB. No schema migration.
- A-08 references A-06 (child profile picture) and A-07 (Katie top-tabs UI) — both shipped.
- DO NOT touch the `personality` section in `seed-data.ts` (the future personality revision is documented separately in PROPOSED-EDITS.md and is not part of this work unit).
- DO NOT make any latency-related code changes — Side fix 3 is investigation only.

---

## ECC DISCIPLINE (mandatory per `BB/nanny-platform/CLAUDE.md` — full agent + skill set)

### Planning (before you start coding)
- Skill: `agentic-engineering` — break A-08 into 15-min verifiable units.
- Agent: `code-architect` — design the `child-onboarding` module against existing module patterns BEFORE writing it.

### Test-first (mandatory per CLAUDE.md hard rules)
- Agent: `tdd-guide` — enforces failing-test-first loop. Mandatory.
- Skill: `ai-regression-testing` — for streaming fix + any latency-related changes. Behavioural stability matters more than raw test count.
- Agent: `pr-test-analyzer` — verify tests cover real behaviour, not tautologies. Especially for AI conversation tests.

### Code review (mandatory after every TS change, run in PARALLEL)
- Agent: `code-reviewer`
- Agent: `typescript-reviewer`

### Specialised review (alongside the two above based on the surface)
- Agent: `silent-failure-hunter` — MANDATORY on the proactive dispatch path.
- Agent: `type-design-analyzer` — MANDATORY on `onboarding_state` discriminated union.
- Agent: `a11y-architect` — MANDATORY on:
  - The "Continue setup with Katie" feed banner.
  - DraftTile / ProgressTile changes (Side fix 1).
  - Streaming bubble + typewriter spoof if shipped (Side fix 2).
  - Any tile-button affordances added inside Katie's deck.
- Agent: `security-reviewer` — invoke if any new server actions are added beyond `update_onboarding_state`.
- Agent: `database-reviewer` — invoke when writing JSONB read/write patterns for `onboarding_state`.
- Agent: `performance-optimizer` — directly relevant for Side fix 2 (streaming) + Side fix 3 (latency report — measurement methodology).

### Build + cleanup
- Agent: `build-error-resolver` — if typecheck or build breaks, invoke immediately for minimal-diff fixes.
- Agent: `code-simplifier` — after main work lands, run on new module + touched components.
- Agent: `refactor-cleaner` — verify no dead code, especially in proactive dispatcher integration.

### Docs
- Agent: `comment-analyzer` — run on the new module file + system prompt fragment.
- Agent: `doc-updater` — after A-08 ships, update CODEMAPS + module-registry doc.

### E2E (after the cascade is functional)
- Agent: `e2e-runner` — Playwright tests for full onboarding cascade end-to-end (nanny + parent variants).
- Skill: `frontend-design` — for the resume banner + any new tile affordances. Anti-template discipline applies.

### Compaction hygiene (per CLAUDE.md)
- Update `build-progress.md` before any compact.
- Update `PROGRESS.md` (in V 1.1 folder) after each shipped sub-piece.
- Don't compact mid-task — finish the current logical unit first.

### Parallel invocation rule (per CLAUDE.md)
Independent reviews go in a SINGLE tool-call batch. Example after shipping the new module:

```
Agent({ subagent_type: "code-reviewer",         prompt: "..." })
Agent({ subagent_type: "typescript-reviewer",   prompt: "..." })
Agent({ subagent_type: "silent-failure-hunter", prompt: "..." })
Agent({ subagent_type: "type-design-analyzer",  prompt: "..." })
```

All four fire at once. Sequential = wasted parent-context tokens + wall-clock time.

---

## SUGGESTED IMPLEMENTATION ORDER

1. **Read every doc** in the READ ORDER section. Sign Block 1.
2. **Plan** with `code-architect` agent + `agentic-engineering` skill (15-min unit breakdown for A-08).
3. **A-08 main onboarding cascade** — TDD loop per unit, parallel reviews after each substantive change.
4. **Side fix 1 (milestone leak)** — small UI fix. code-reviewer + typescript-reviewer + a11y-architect.
5. **Side fix 2 (streaming or spoof)** — diagnostic first, then fix. performance-optimizer + ai-regression-testing skill.
6. **Side fix 3 (latency report)** — performance-optimizer for measurement methodology, write the audit report, hand back to Bailey. **NO CODE CHANGES.**
7. **e2e-runner** pass on the full onboarding flow.
8. **doc-updater** + **comment-analyzer** passes.
9. **Final verification** — manual smoke test on real device for both flows.
10. **Sign Block 2** with timestamp + final commit hash.

---

## DEFINITION OF "COMPLETE TO STANDARD"

You can sign Block 2 only when ALL of the following are true:

- [ ] All four deliverables shipped (or the latency report delivered for Side fix 3).
- [ ] Quality bar fully met (every checkbox above).
- [ ] All ECC reviews run + HIGH/CRITICAL findings closed.
- [ ] All CI gates green.
- [ ] Manual smoke tests passed on real device.
- [ ] PROGRESS.md updated per shipped piece.
- [ ] e2e Playwright tests written + passing for nanny + parent flows.
- [ ] No regressions in the existing 700+ test suite.
- [ ] No new files exceed 800 lines, no functions exceed 50 lines.
- [ ] No `any`, no console.log, no mutation, no hardcoded secrets.

---

## GOAL

Ship A-08 + side fixes 1+2 ready for live alpha testing. Bailey will test with one trusted nanny + one trusted parent before broader rollout. The latency investigation report is delivered separately for Bailey's review and decision.

After this work unit completes, V 1.1 is fully shipped and the project moves to PAYMENTS (`system/APP/PAYMENTS/`) — a separate, larger work unit not in scope here.

---

**End of handoff document. Sign Block 1 above before starting work. Sign Block 2 above when complete.**
