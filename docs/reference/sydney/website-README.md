> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Baby Bloom Education App — Build Guide

Rebuilding the Baby Bloom education app from a vanilla JS + Google Apps Script prototype into the existing Next.js 14 platform (Supabase, Tailwind, shadcn/ui, Vercel).

---

## Reference Documents

All specifications live in `system/APP/`. Read only what you need for the current task.

| Document | Purpose | Read when... |
|---|---|---|
| `INTEGRATION-PLAN.md` | Database schema, server actions, route structure, feed assembly, report cascade | Building any backend or database work |
| `DATA-MODEL.md` | Entity relationships, field descriptions, access control | Understanding data shapes or RLS |
| `COMPONENT-MAP.md` | Every UI component mapped to shadcn/ui primitives | Building any frontend component |
| `BUSINESS-LOGIC.md` | Revenue model, two nanny paths, pipeline stages | Understanding why something works a certain way |
| `USER-FLOWS.md` | Step-by-step user journeys for every feature | Building any user-facing flow |
| `MILESTONE-LIBRARY.md` | 41 milestones across 7 domains and 6 age brackets | Working with milestone data |
| `ONBOARDING-LOGIC.md` | Path A/B onboarding sequences | Building child creation or onboarding |

**Build Blueprint**: `.claude/plans/purrfect-baking-hippo.md` — the approved phase-by-phase implementation spec with exact component specs, GAS equivalents, and nuances.

---

## App Root

```
BB/nanny-platform/app/          ← Next.js application root
├── src/
│   ├── app/                    ← Pages and routes
│   ├── components/             ← React components (including ui/ for shadcn)
│   ├── lib/                    ← Server actions, AI, Supabase clients, utilities
│   └── types/                  ← TypeScript type definitions
├── supabase/migrations/        ← SQL migration files
└── public/                     ← Static assets
```

---

## Build Phases

| Phase | Deliverables | Status |
|---|---|---|
| **0** | Database (6 tables + RLS + seed milestones) + TypeScript types + constants | Done |
| **1** | Education Tab in hubs + child_client CRUD + Path A onboarding + Path B "Add New" | — |
| **2** | BAppLayout + Feed view + FAB + Observation sheet (all 3 types) + Observation/Progress tiles | — |
| **3** | Diary sheet (food + sleep) + Diary tile | — |
| **4** | Plan sheet + OpenAI integration + Activity tile (pending/ready) + smart polling | — |
| **5** | Activity detail sheet (6 accordions) + Review sheet + report cascade + progress recalculation | — |
| **6** | Progress dashboard (radar chart + stats grid) | — |
| **7** | Parent entry point + AI insights + polish | — |

Track detailed progress in **[PROGRESS.md](./PROGRESS.md)**.

---

## Development Rules

### 1. One phase at a time

Complete every deliverable in the current phase before moving to the next. Do not start Phase N+1 while Phase N has untested or incomplete items. Each phase must end with a verification step confirming all deliverables work.

### 2. Read before you write

Never modify a file you haven't read. Never create a component without reading the spec for it in `COMPONENT-MAP.md` and the Build Blueprint. Never write a server action without reading the relevant section of `INTEGRATION-PLAN.md`.

### 3. Match existing conventions exactly

| Convention | Pattern |
|---|---|
| Server actions | `'use server'`, `createAdminClient()` for queries, return `{ success, error, data? }`, `revalidatePath()` after mutations |
| Pages | `page.tsx` (async server component) → fetch data → pass props → `ClientComponent.tsx` (`"use client"`) |
| Tab styling (main) | `flex gap-1 rounded-xl bg-slate-100 p-1`, active: `bg-white text-slate-900 shadow-sm` |
| Tab styling (sub) | `flex gap-0.5 rounded-lg bg-slate-100 p-0.5`, active: `bg-white text-slate-900 shadow-sm` |
| Utilities | `cn()` from `@/lib/utils`, Lucide React icons |
| Supabase | `createAdminClient()` for all education queries (bypasses RLS) |
| Types | `src/types/bapp.ts` |
| Constants | `src/lib/bapp-constants.ts` |

### 4. Stay on spec

Build exactly what the blueprint specifies. Do not add features, abstractions, or "improvements" beyond what is documented. If the spec says 3 buttons, build 3 buttons. If the spec says a 2x2 grid, build a 2x2 grid.

- No extra error handling beyond what the spec calls for
- No utility functions for one-time operations
- No future-proofing or configurability that isn't in the spec
- No docstrings or comments unless the logic is non-obvious

### 5. Component isolation

Each component must be self-contained and testable in isolation. Shared components go in `src/components/bapp/shared/`. Sheet components go in `src/components/bapp/sheets/`. Tile components go in `src/components/bapp/tiles/`.

```
src/components/bapp/
├── shared/          ← MilestoneBrowser, MasteryRatingGrid, ImageUpload, DomainBadge, etc.
├── sheets/          ← ObservationSheet, DiarySheet, PlanSheet, ReviewSheet, ActivityDetailSheet
├── tiles/           ← ObservationTile, ProgressTile, DiaryTile, ActivityTile, ReportTile, InsightTile
├── BAppLayout.tsx
├── BAppFeedView.tsx
├── BAppProgressView.tsx
├── ChildCardGrid.tsx
├── AddChildSheet.tsx
└── OnboardSheet.tsx
```

### 6. Server actions directory

All education app server actions go in `src/lib/actions/bapp/`. One file per domain:

```
src/lib/actions/bapp/
├── child-clients.ts
├── milestones.ts
├── feed.ts
├── observations.ts
├── diary.ts
├── activities.ts
├── reports.ts
├── progress.ts
├── insights.ts
└── pipeline.ts
```

### 7. No silent failures

Every server action returns `{ success: boolean; error: string | null; data?: T }`. Log errors server-side with `console.error`. Surface user-facing errors via the return value, never swallow them.

### 8. Update PROGRESS.md after every phase

When a phase is complete, update `PROGRESS.md` with:
- Files created (full paths)
- Files modified (full paths + what changed)
- Verification results (what was tested, what passed)
- Any deviations from the blueprint (and why)
- Blockers or known issues carried forward

---

## Critical Nuances Checklist

These are the non-obvious requirements that must be respected throughout the build. Reference this list before marking any phase complete.

- [ ] **Scores only go up**: `Math.max(existing, new)` in recalculateProgress — never regress
- [ ] **Context filtering**: "All" feed tab ONLY shows `context='adhoc'` — type tabs show all contexts
- [ ] **Report cascade**: Creates 3-5 `bapp_logs` rows (report + progress + optional observation + history snapshot + activity status update)
- [ ] **Image upload before save**: Upload to Supabase Storage FIRST, then pass URL to server action
- [ ] **Smart polling**: Only when pending activities exist, 10s interval, silent refresh
- [ ] **Plan limit**: Max 3 milestones, accordion hides at limit, "Ready to Generate!" message
- [ ] **Accordion snap-back**: Plan modal auto-closes accordion after selection
- [ ] **Duration calculation**: Sleep diary handles overnight (end < start → add 24h)
- [ ] **Bottle quantity**: Dropdown in 30ml increments (30ml/1oz → 240ml/8oz), not free text
- [ ] **Food conditional fields**: Meal/Snack → textarea, Bottle → quantity dropdown
- [ ] **Modal reset**: Always clear state on open — prevent state leakage between sessions
- [ ] **Author attribution**: Every feed tile shows who created it (nanny name vs parent name)
- [ ] **Status transition**: First app action → 'active_nanny' (only if status is 'setup' or 'created_manual')
- [ ] **Path B email validation**: Check parent email doesn't have active placement before creating child
- [ ] **under_three is permanent**: Set once at creation, never auto-updated
- [ ] **Shell children**: Path A children start with no name/DOB — must onboard before using app
- [ ] **Both roles get FAB**: Parent has identical capabilities to nanny — full CRUD
- [ ] **Report tile embeds progress**: Report tile renders inline progress from sibling log entry
- [ ] **Diary uses data.subtype**: Not the `context` column — context is always 'adhoc' for diary
- [ ] **Milestone browser shows mastery**: Current score displayed next to each milestone via progress matrix
- [ ] **createAdminClient()**: Use for ALL education queries (matches existing pattern, bypasses RLS)

---

## Deploy

```bash
cd BB/nanny-platform/app && vercel --prod
```

Target: `app-babybloom.vercel.app`
