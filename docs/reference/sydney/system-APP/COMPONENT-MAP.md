> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Component Map

Mapping every prototype screen and element to Next.js components and shadcn/ui primitives, including the Education tab entry points and onboarding flows.

## Route Structure

```
/nanny/development/
  ├── page.tsx                        → Education tab (child cards grid + "Add New")
  └── [childId]/
      ├── page.tsx                    → Feed view + FAB
      ├── progress/page.tsx           → Progress dashboard
      └── onboard/page.tsx            → Name/DOB onboarding (Path A shells)

/parent/development/
  ├── page.tsx                        → Education tab (single child)
  └── [childId]/
      ├── page.tsx                    → Feed view + FAB (full access)
      └── progress/page.tsx           → Progress dashboard
```

---

## Education Tab Components (NEW)

### NannyEducationTab

Entry point for nannies. Shows all children with `under_three = true`.

| Component | Description | shadcn/ui |
|---|---|---|
| `ChildCardGrid` | Grid of child cards, one per child_client | — |
| `ChildCard` | Onboarded: name + age + status badge. Shell: "Child 1 — ~8mo" + "Set up" prompt | `Card`, `Badge` |
| `AddChildButton` | "Add New" button for Path B | — |
| `AddChildSheet` | Sheet: first name, DOB, gender, parent email | `Sheet`, `Input`, `Select` |

### ParentEducationTab

Entry point for parents. Shows their single child (auto-navigates if only one).

| Component | Description | shadcn/ui |
|---|---|---|
| `ParentChildCard` | Single child card with name + age + status | `Card`, `Badge` |

### OnboardSheet (Path A)

Shown when nanny/parent taps a shell child card that hasn't been onboarded.

| Component | Description | shadcn/ui |
|---|---|---|
| `OnboardSheet` | Pre-filled: approx age, gender. Enter: first name, DOB. Confirm button. | `Sheet`, `Input` |

---

## Layout Components

### BAppLayout

Wraps all development app pages (inside `[childId]/`). Replaces prototype's fixed nav bars.

| Element | Prototype | Next.js Component | Notes |
|---|---|---|---|
| Top nav | Fixed `div` with avatar + name + logout | `BAppHeader` | Child name, avatar initial, back to Education tab link |
| Bottom nav | Fixed grid with 2 icons | `BAppBottomNav` | Feed + Progress tabs, active state management |
| FAB | Fixed button group | `BAppFAB` | Rendered for **both** nanny and parent roles |

### shadcn/ui for layout:
- `Tabs` — for bottom nav switching (or Next.js route-based)

---

## Feed Components

### FeedView

Main timeline container. Server component fetches data, client component handles filtering.

| Component | Prototype Source | Props | shadcn/ui |
|---|---|---|---|
| `FeedFilterBar` | `#feedFilterBar` (5 pill buttons) | activeFilter, onFilter | Custom pill buttons |
| `FeedContainer` | `#feedContainer` | items[], filter | — |

### Feed Tile Components

Each prototype tile renderer becomes a React component. All tiles include **author attribution** (who created this entry).

| Component | Prototype | Key Features |
|---|---|---|
| `ActivityTile` | `FeedCard_Activity` | Pending state (spinner), resolved state (title + desc + "View Activity" button), author name |
| `ReportTile` | `FeedCard_Report` | Parent activity title lookup, evidence image, inline progress updates, author name |
| `ObservationTile` | `FeedCard_Observation` | Domain badges (General vs multi-domain), optional image, optional mastery badge, author name |
| `ProgressTile` | `FeedCard_Progress` | Skills list with domain badge + score, optional note + image, author name |
| `DiaryTile` | `FeedCard_Diary` | Food variant (detail + time) and Sleep variant (start/end/duration/notes), author name |
| `InsightTile` | `FeedCard_Insight` | AI text in quotes, amber styling (no author — system-generated) |

### Shared tile elements:
- **TileHeader**: icon circle + badge text + date + **author name** (consistent across all tiles)
- **TileImage**: Rounded image with border (used by Report, Observation, Progress)
- **MasteryBadge**: Score label in colored pill

### shadcn/ui for tiles:
- `Card` — tile container
- `Badge` — domain badges, status badges, mastery labels, author pill

---

## Activity Detail Components

### ActivityDetailSheet

Full-screen sheet showing the "recipe book" activity view.

| Component | Prototype Element | shadcn/ui |
|---|---|---|
| `ActivityDetailSheet` | `#activityDetailModal` | `Sheet` (full-screen) |
| `ActivityHeader` | Title + recommendation line | — |
| `ActivityDescription` | Description paragraph | — |
| `ObjectivesSection` | Milestone list with domain + "New"/"Mastered" | `Accordion`, `Badge` |
| `IntentionSection` | Educational purpose text | `Accordion` |
| `SuppliesSection` | Supplies list | `Accordion` |
| `GuideSection` | Numbered steps | `Accordion` |
| `TipsSection` | Encouragement text | `Accordion` |
| `ObservationsSection` | What to Watch For — `keyObservations[]` with domain + objective + 4 mastery level descriptions | `Accordion` |
| `CompleteButton` | "Complete & Report" CTA (if status='ready') | — |

### shadcn/ui:
- `Sheet` — full-screen overlay
- `Accordion` — collapsible sections (6 sections)
- `Badge` — domain labels, "New"/"Mastered" indicators

---

## Plan Activity Components

### PlanSheet

Full-screen sheet for activity planning. Available to **both nanny and parent**.

| Component | Prototype Element | shadcn/ui |
|---|---|---|
| `PlanSheet` | `#planModal` | `Sheet` |
| `SelectedObjectivesTags` | `#planActiveTags` | `Badge` (removable) |
| `MilestoneAccordion` | `#milestoneAccordion` | `Accordion` |
| `MilestoneItem` | Selectable milestone row | Checkbox-style row |
| `MaxLimitMessage` | "Ready to Generate!" | — |
| `GenerateButton` | "Create Activity" footer | — |

---

## Review (Report) Components

### ReviewSheet

Bottom drawer for activity reporting.

| Component | Prototype Element | shadcn/ui |
|---|---|---|
| `ReviewSheet` | `#reviewModal` | `Sheet` (from bottom) |
| `MilestoneRatingCard` | Per-milestone 2x2 grid | Custom rating grid |
| `MasteryButton` | 4 mastery level buttons | `ToggleGroup` or custom |
| `ReviewNotes` | Textarea | `Textarea` |
| `EvidenceUpload` | File input | Custom upload component |

---

## Observation Components

### ObservationSheet

Bottom drawer with 3-step wizard.

| Component | Prototype Element | shadcn/ui |
|---|---|---|
| `ObservationSheet` | `#logModal` | `Sheet` |
| `ObsTypeSelector` | Step 1: 3 buttons | Card-style buttons |
| `GeneralObsForm` | `#logStepGeneral` | `Textarea` |
| `FocusedObsForm` | `#logStepFocused` | `Select`, `Badge`, `Textarea` |
| `ProgressObsForm` | `#logStepProgress` | `Accordion`, rating grid |
| `ProgressSummary` | `#logStepProgressNote` | Summary cards + `Textarea` |
| `ImageUpload` | File inputs | Shared upload component |

---

## Diary Components

### DiarySheet

Bottom drawer with 2-step wizard.

| Component | Prototype Element | shadcn/ui |
|---|---|---|
| `DiarySheet` | `#diaryModal` | `Sheet` |
| `DiaryTypeSelector` | Step 1: 2 buttons | Card-style buttons |
| `FoodLogForm` | `#diaryStepFood` | `Select`, `Textarea`, time `Input` |
| `SleepLogForm` | `#diaryStepSleep` | Time `Input` (x2), duration display, `Textarea` |

---

## Progress Dashboard Components

### ProgressView

| Component | Prototype Element | Library |
|---|---|---|
| `RadarChart` | `#radarChart` (Chart.js canvas) | recharts ^3.8.0 (already installed) |
| `StatsGrid` | `#statsGrid` (2-col grid) | `Card` components |
| `LiveBadge` | "Live" pill | `Badge` |

---

## Reusable Components Summary

| shadcn/ui Component | Usage Count | Used In |
|---|---|---|
| `Sheet` | 7 | Plan, Activity Detail, Review, Observation, Diary, Add Child, Onboard |
| `Accordion` | 3 | Activity Detail (6 sections), Plan (milestone browser), Progress Obs |
| `Badge` | 10+ | Domain labels, mastery scores, status indicators, filter pills, author pills, child status |
| `Card` | 8+ | Feed tiles, stats grid, child cards (Education tab) |
| `Select` | 4 | Domain picker, food type, bottle quantity, gender |
| `Textarea` | 5 | Review notes, observation notes, food details, sleep notes |
| `Input` | 5+ | Time inputs, first name, DOB, parent email |
| `ToggleGroup` | 2 | Mastery rating buttons (review, progress obs) |
| `Tabs` | 1 | Bottom nav (Feed/Progress) |

---

## Shared Utility Components

| Component | Purpose |
|---|---|
| `ImageUpload` | Supabase Storage upload (bucket: `development-images`) with preview — reused in Review, General Obs, Focused Obs, Progress Obs |
| `MasteryRatingGrid` | 2x2 or 1x4 mastery level selector (scores 1-4: Introduced/Assisted/Guided/Independent) — reused in Review and Progress Obs |
| `MilestoneBrowser` | Accordion browser for milestone library — reused in Plan and Progress Obs |
| `DomainBadge` | Colored domain label — reused everywhere |
| `TileHeader` | Icon + label + date + author row — reused in all 6 feed tiles |
| `AuthorPill` | Nanny/Parent name pill showing who created an entry — reused in all feed tiles |
| `MasteryLabel` | Score (1-4) → label text + color — reused in tiles, milestone browser, progress views |
| `StatusBadge` | Child pipeline status indicator — used on child cards in Education tab |

---

## Supporting Files

| File | Purpose |
|---|---|
| `src/lib/types/bapp.ts` | TypeScript types for all entities (ChildClient, ActivityPlan, BAppLog, etc.) |
| `src/lib/constants/bapp.ts` | DOMAINS map (code → label + color), MASTERY_LABELS, MAX_MILESTONES_PER_ACTIVITY, FEED_POLL_INTERVAL, LOG_TYPES |
| `src/lib/ai/prompts/bapp-activity-generation.ts` | System + user prompt for OpenAI activity generation, expected response format |

---

## Feed Behavior Notes

- **Smart polling**: `BAppFeedView` polls every 10s when feed contains a pending Activity (status='pending'). Matches GAS prototype polling behavior.
- **Context filtering**: "All" tab hides observations with context='activity'/'assessment'. Type-specific tabs show all items regardless of context.
- **Author attribution**: Every feed tile displays who created it (nanny name vs parent name) via TileHeader + AuthorPill.
