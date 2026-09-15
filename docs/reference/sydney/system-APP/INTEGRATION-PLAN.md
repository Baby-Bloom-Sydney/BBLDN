> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Integration Plan

Rebuilding the Baby Bloom development app from the vanilla JS + Google Apps Script prototype into the existing Next.js 14 platform.

---

## GAS → Supabase Translation

The prototype backend runs on Google Apps Script with Google Sheets as the database and Make.com as an AI intermediary. This table maps every GAS pattern to its Supabase replacement.

| GAS Pattern | Supabase Replacement |
|---|---|
| Polymorphic 8-column log (ID, TIMESTAMP, CHILD_ID, AUTHOR_ID, TYPE, STATUS, REF_JSON, DATA_JSON) | Single `bapp_logs` table with type column + JSONB data — same polymorphic pattern as GAS |
| Per-child sheet + master_LOG dual-write | Single INSERT into `bapp_logs` — SQL handles querying naturally |
| JSON domain columns in DB_Progress (`{milestoneId: score}` per domain) | `bapp_progress_scores` table with JSONB scores column per domain row |
| DB_History snapshot table (per-domain score totals) | `bapp_progress_history` table with domain total columns |
| Make.com → OpenAI async webhook | Direct OpenAI call from server action (using existing `src/lib/ai/client.ts`) |
| Image as separate LOG entry with TYPE="IMAGE" | `image_url` field in parent entry's `data` JSONB — no separate type needed |
| Context tags (ADHOC/ACTIVITY/ASSESSMENT) controlling feed visibility | `context` column on `bapp_logs` — 'adhoc' for standalone, 'activity' for report children, 'assessment' for progress children |
| REF_JSON array linking to parent logs | `parent_log_id` self-referencing FK on `bapp_logs` |
| `updateLogStatus()` to change PENDING→COMPLETED | Direct UPDATE on `bapp_logs` WHERE type='activity' |
| Sheet template auto-creation per child | Not needed — Supabase tables exist permanently |
| `createLogEntry()` dual-write to child sheet + master_LOG | Single INSERT — no dual-write needed |
| `syncToMasterLog()` for AI response write-back | Direct UPDATE on `bapp_logs.data` to set activity_json |
| PropertiesService for spreadsheet IDs | Supabase client (env vars for connection) |

---

## Database: Supabase Tables

6 new tables + 1 events table. All use standard Baby Bloom conventions: UUID PKs, `created_at`/`updated_at` timestamps, snake_case naming.

### 1. `child_client`

The central entity bridging matchmaking and education. Every child interacting with the Baby Bloom education app is a `child_client`. Created via auto-generation from placements (Path A) or manually by nannies (Path B).

```sql
CREATE TABLE child_client (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    placement_id UUID REFERENCES nanny_placements(id) ON DELETE SET NULL,  -- Path A: immediate. Path B: set when parent joins.
    nanny_user_id UUID NOT NULL REFERENCES auth.users(id),  -- The nanny who created/manages this child
    parent_user_id UUID REFERENCES auth.users(id),  -- Set when parent is on the platform
    parent_lead_email TEXT,  -- Path B: parent's email provided by nanny. Used to link on signup.

    first_name TEXT,  -- Confirmed during app onboarding. NULL for Path A shells.
    date_of_birth DATE,  -- Confirmed during app onboarding. NULL for Path A shells.
    gender TEXT,  -- NULL = prefer not to say. May be pre-populated from position.
    age_months_approx INTEGER,  -- From position_children (Path A). Before exact DOB known.

    under_three BOOLEAN NOT NULL DEFAULT false,  -- One-time flag. Gates Education tab visibility. Not auto-recalculated.
    onboarded BOOLEAN NOT NULL DEFAULT false,  -- True once first_name + date_of_birth confirmed.
    status TEXT NOT NULL DEFAULT 'created_auto',  -- Current pipeline status (see child_client_events for history)

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for Education tab queries
CREATE INDEX idx_child_client_nanny ON child_client(nanny_user_id) WHERE under_three = true;
CREATE INDEX idx_child_client_placement ON child_client(placement_id);
CREATE INDEX idx_child_client_parent_email ON child_client(parent_lead_email) WHERE parent_lead_email IS NOT NULL;
```

### 2. `child_client_events`

Pipeline tracking. One row per child, every status is a nullable timestamp column. Enables time-in-stage analytics and conversion metrics without aggregation queries.

```sql
CREATE TABLE child_client_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_client_id UUID NOT NULL UNIQUE REFERENCES child_client(id) ON DELETE CASCADE,

    created_auto_at TIMESTAMPTZ,     -- When auto-created from placement
    created_manual_at TIMESTAMPTZ,   -- When manually created by nanny
    setup_at TIMESTAMPTZ,            -- When name/DOB confirmed in app
    active_nanny_at TIMESTAMPTZ,     -- When nanny began using app with this child
    trial_at TIMESTAMPTZ,            -- When parent signed up (30-day trial start)
    trial_ended_at TIMESTAMPTZ,      -- When trial expired
    active_at TIMESTAMPTZ,           -- When parent paid/converted
    closed_at TIMESTAMPTZ            -- When ended
);
```

### 3. `bapp_milestones`

Replaces GAS REF_Milestones sheet. Admin-managed, expandable. Text PK matches GAS structured IDs.

```sql
CREATE TABLE bapp_milestones (
    id TEXT PRIMARY KEY,  -- Keep structured IDs: "CL-03-A"
    domain TEXT NOT NULL,  -- CL, PSE, PD, LIT, NUM, UW, EAD
    age_bracket TEXT NOT NULL,  -- "0-3 months", "24-32 months", etc.
    description TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. `bapp_logs`

The single polymorphic feed table. Mirrors the GAS 8-column log schema. All feed items (activities, reports, observations, diary entries, insights) share this table, differentiated by `type`.

```sql
CREATE TABLE bapp_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_client_id UUID NOT NULL REFERENCES child_client(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id),
    type TEXT NOT NULL CHECK (type IN ('activity', 'report', 'progress', 'observation', 'diary', 'insight')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'ready', 'completed')),
    context TEXT NOT NULL DEFAULT 'adhoc' CHECK (context IN ('adhoc', 'activity', 'assessment')),
    parent_log_id UUID REFERENCES bapp_logs(id) ON DELETE SET NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feed query: all logs for a child, sorted by time
CREATE INDEX idx_bapp_logs_child ON bapp_logs(child_client_id, created_at DESC);
-- Report cascade: find children of a parent log
CREATE INDEX idx_bapp_logs_parent ON bapp_logs(parent_log_id) WHERE parent_log_id IS NOT NULL;
-- Type-specific queries
CREATE INDEX idx_bapp_logs_type ON bapp_logs(child_client_id, type);
-- Smart polling: find pending activities
CREATE INDEX idx_bapp_logs_pending ON bapp_logs(child_client_id) WHERE status = 'pending';
```

**Context column**: Controls feed visibility. Directly replaces GAS `DATA_CONFIG.CONTEXT`:
- `'adhoc'` — Standalone entry. Shows in feed "All" tab.
- `'activity'` — Child of an activity report. Hidden from "All" tab. Visible in type-specific filter tabs.
- `'assessment'` — Child of a bulk progress update. Hidden from "All" tab. Visible in type-specific filter tabs.

**parent_log_id**: Self-referencing FK. Points to the parent entry in the cascade chain:
- REPORT → parent_log_id = the activity being reported on
- PROGRESS (from report cascade) → parent_log_id = the report
- OBSERVATION (from report cascade) → parent_log_id = the report
- Standalone entries → parent_log_id = NULL

### 5. `bapp_progress_scores`

Current per-domain mastery scores. Replaces GAS DB_Progress sheet (which stored JSON per domain column).

```sql
CREATE TABLE bapp_progress_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_client_id UUID NOT NULL REFERENCES child_client(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,  -- CL, PSE, PD, LIT, NUM, UW, EAD
    scores JSONB NOT NULL DEFAULT '{}',  -- {milestoneId: score} map — same shape as GAS domain JSON columns (e.g., {"CL-03-A": 3, "CL-2432-A": 2})
    percent NUMERIC NOT NULL DEFAULT 0,  -- Precomputed: round((sum_of_scores / (milestone_count × 4)) × 100)
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(child_client_id, domain)
);
```

**Progress formula** (from GAS `getDashboardData()`):
```
percent = round((sum_of_all_scores_in_domain / (milestone_count_in_domain × 4)) × 100)
```
Where:
- `sum_of_all_scores_in_domain` = sum of all values in the `scores` JSONB
- `milestone_count_in_domain` = count of active milestones for this domain in `bapp_milestones`
- `4` = maximum mastery score (Independent)

### 6. `bapp_progress_history`

Historical progress snapshots. Replaces GAS DB_History sheet. Written on every progress update for trend tracking.

```sql
CREATE TABLE bapp_progress_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_client_id UUID NOT NULL REFERENCES child_client(id) ON DELETE CASCADE,
    ref_log_id UUID REFERENCES bapp_logs(id) ON DELETE SET NULL,  -- Which log entry triggered this snapshot
    cl_total INTEGER DEFAULT 0,   -- Sum of all CL milestone scores
    pse_total INTEGER DEFAULT 0,  -- Sum of all PSE milestone scores
    pd_total INTEGER DEFAULT 0,
    lit_total INTEGER DEFAULT 0,
    num_total INTEGER DEFAULT 0,
    uw_total INTEGER DEFAULT 0,
    ead_total INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## DataJson Shapes Per Type

The `bapp_logs.data` JSONB column stores type-specific payloads. Each type has a defined shape based on the GAS prototype's DataJson patterns (confirmed via master_LOG CSV analysis).

### Activity (`type = 'activity'`)

Status progresses: pending → ready → completed.

```typescript
{
  milestone_ids: string[],              // Selected milestone IDs (max 3)
  prompt_context: { domain: string, age: string, desc: string }[],  // Sent to OpenAI
  activity_json: null | ActivityPlan,   // null while pending, full plan when ready
  title: string                         // Display title for feed
}
```

### Report (`type = 'report'`)

Always status='completed'. parent_log_id → activity.

```typescript
{
  feedback: string | null,              // Optional text feedback
  rating_count: number,                 // Number of milestones rated
  title: string,                        // "Activity Report"
  image_url: string | null              // Supabase Storage URL (replaces GAS IMAGE entries)
}
```

### Progress (`type = 'progress'`)

Standalone (adhoc) or from report cascade (activity context).

```typescript
{
  updates: { id: string, score: number }[],  // Milestone mastery ratings
  title: string,                              // Activity title or "Manual Progress Update"
  image_url: string | null
}
```

### Observation (`type = 'observation'`)

Three subtypes: general, focused, from report cascade.

```typescript
{
  domain: string | null,                // "General", "CL", "PD", etc.
  milestone_id: string | null,         // Optional specific milestone (focused)
  score: number | null,                // 1-4 mastery scale (focused)
  note: string | null,                 // Observation text
  title: string,                       // "Note: [domain]" or "Observation"
  image_url: string | null
}
```

### Diary (`type = 'diary'`)

Always status='completed', context='adhoc'. Subtype distinguishes food vs sleep.

```typescript
// Food
{
  subtype: "meal" | "snack" | "bottle",
  details: string | null,              // What they had (meals/snacks)
  quantity: string | null,             // "90ml / 3oz" (bottles)
  time: string,                        // "HH:MM"
  title: "Food Log"
}

// Sleep
{
  subtype: "sleep",
  start: string,                       // "HH:MM"
  end: string,                         // "HH:MM"
  duration: string | null,             // Calculated "0h 25m"
  notes: string | null,
  title: "Sleep Log"
}
```

### Insight (`type = 'insight'`)

AI-generated developmental insights. Always status='completed'.

```typescript
{
  text: string,                        // AI-generated insight text
  title: string
}
```

---

## Auto-Creation Logic (Path A)

When a `nanny_placement` is created from a matched position:

1. Read `position_children` for that position
2. For each child:
   - Create a `child_client` row with:
     - `placement_id` = the new placement
     - `nanny_user_id` = nanny's auth user ID
     - `parent_user_id` = parent's auth user ID
     - `age_months_approx` = child's age from position
     - `gender` = from position data (map `'Rather Not Say'` → NULL)
     - `under_three` = true if age < 36 months, false otherwise
     - `onboarded` = false (shell — no name/DOB yet)
     - `status` = 'created_auto'
   - Create matching `child_client_events` row with `created_auto_at = NOW()`
3. All children get `child_client` rows (for the platform). Only those with `under_three = true` appear in the Education tab.

---

## Parent Linking Logic (Path B)

When a parent signs up and their email matches a `child_client.parent_lead_email`:

1. Find `child_client` where `parent_lead_email = parent's email`
2. Create a `nanny_placement` linking the nanny and parent
3. Update `child_client`:
   - Set `placement_id` = new placement
   - Set `parent_user_id` = parent's auth user ID
   - Set `status` = 'trial'
4. Update `child_client_events.trial_at = NOW()`
5. 30-day trial countdown begins

---

## Access Control: Dual-Path RLS

Access is determined by either direct ownership (nanny_user_id) OR placement membership. Both nanny and parent get **full CRUD** — no read-only restrictions.

### Core Principle

- **Nanny**: Full CRUD via `nanny_user_id` (always) or placement membership
- **Parent**: Full CRUD via placement membership (once they've signed up)
- **Admin**: Full access via `createAdminClient()`

### RLS Helper Function

```sql
CREATE OR REPLACE FUNCTION user_has_child_access(child_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM child_client cc
        WHERE cc.id = child_uuid
        AND (
            -- Direct nanny ownership (works before placement exists)
            cc.nanny_user_id = auth.uid()
            OR
            -- Placement-based access (works for both nanny and parent)
            EXISTS (
                SELECT 1 FROM nanny_placements np
                WHERE np.id = cc.placement_id
                AND np.status = 'active'
                AND (
                    np.nanny_id IN (SELECT id FROM nannies WHERE user_id = auth.uid())
                    OR
                    np.parent_id IN (SELECT id FROM parents WHERE user_id = auth.uid())
                )
            )
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Policy Pattern (applied to all bapp_* tables)

```sql
-- Both nanny and parent: full CRUD
CREATE POLICY "user_crud" ON bapp_logs
    FOR ALL
    USING (user_has_child_access(child_client_id))
    WITH CHECK (user_has_child_access(child_client_id));
```

### child_client RLS

```sql
-- Nanny: can see/manage their children
CREATE POLICY "nanny_access" ON child_client
    FOR ALL
    USING (nanny_user_id = auth.uid())
    WITH CHECK (nanny_user_id = auth.uid());

-- Parent: can see children on their placements
CREATE POLICY "parent_access" ON child_client
    FOR SELECT
    USING (
        placement_id IN (
            SELECT np.id FROM nanny_placements np
            JOIN parents p ON p.id = np.parent_id
            WHERE p.user_id = auth.uid()
        )
    );
```

---

## AI Prompt Design

The GAS prototype sends activity generation requests to a Make.com webhook with this payload:
```json
{
  "activityId": "uuid",
  "childId": "child-uuid",
  "childName": "Emma",
  "childAgeMonths": 18,
  "promptContext": [
    {"domain": "PD", "age": "12-18 months", "desc": "Walks with support and begins independent steps"},
    {"domain": "CL", "age": "12-18 months", "desc": "Uses 10-20 words and follows simple instructions"}
  ],
  "milestoneIds": ["PD-1218-A", "CL-1218-A"]
}
```

Make.com then calls OpenAI and writes the response back to the spreadsheet. **We replace this with a direct OpenAI call from a server action** using the existing client at `src/lib/ai/client.ts` (50s timeout).

### Prompt Structure

**System prompt**: Describes Baby Bloom's educational philosophy, the 7 developmental domains, the 4-level mastery scale, and the target output format.

**User prompt**: Includes child name, age in months, and the selected milestone context array.

### Expected Response (ActivityPlan)

The AI response must match this structure (from GAS `DATA_CONFIG.AI_STRUCTURE`):

```typescript
interface ActivityPlan {
  creativeName: string        // Fun activity title (e.g., "Bubble Symphony")
  recommendedLine: string     // Age recommendation line
  activityDescription: string // Overview paragraph
  objectivesList: string[]    // Learning objectives
  intention: string           // Developmental purpose
  supplies: string[]          // Materials needed
  suppliesDisclaimer: string  // Safety/substitution note
  activityGuide: string[]     // Step-by-step instructions
  encouragementTips: string[] // Parent/nanny guidance tips
  keyObservations: Array<{    // What developmental signs to watch for
    domain: string            // Domain code (CL, PD, etc.)
    objective: string         // What to observe
    levels: {                 // Descriptions per mastery level
      introduced: string      // What "Introduced" looks like
      assisted: string        // What "Assisted" looks like
      guided: string          // What "Guided" looks like
      independent: string     // What "Independent" looks like
    }
  }>
}
```

The `keyObservations.levels` structure maps directly to the 4-point mastery scale (scores 1-4). The activity detail view displays these as observation guides, and the review/report flow uses the same milestone-to-score mapping.

### AI Prompt File

**Create**: `src/lib/ai/prompts/bapp-activity-generation.ts`

---

## Feed Assembly

Replaces GAS `getChildFeed()`, which reads all rows from a child's sheet and returns them sorted by timestamp.

### Query Strategy

Single-table query with optional self-join for parent data:

```sql
SELECT bl.*,
       parent.data as parent_data,
       parent.type as parent_type,
       up.first_name as author_name
FROM bapp_logs bl
LEFT JOIN bapp_logs parent ON bl.parent_log_id = parent.id
LEFT JOIN user_profiles up ON bl.author_id = up.user_id
WHERE bl.child_client_id = $1
ORDER BY bl.created_at DESC;
```

### Feed Filtering (Context-Based Visibility)

Matches GAS `DATA_CONFIG.CONTEXT` system exactly. Client-side filtering on the query results:

| Filter Tab | Shows | Rule |
|---|---|---|
| **All** | Everything where `context = 'adhoc'` | Hides report cascade children (context='activity'/'assessment') |
| **Activities** | `type IN ('activity', 'report')` | All, regardless of context |
| **Obs** | `type = 'observation'` | All, regardless of context |
| **Growth** | `type IN ('progress', 'diary')` | All, regardless of context |
| **Insights** | `type = 'insight'` | All |

### Smart Polling

When the feed contains a `bapp_logs` row with `type = 'activity'` and `status = 'pending'`, the frontend polls every 10 seconds until the activity resolves to 'ready' or 'completed'. Matches GAS prototype behavior.

---

## Report Cascade

When `submitReport()` is called (matches GAS `submitActivityReport()`), it triggers a cascade of writes — all INSERTs into `bapp_logs` with different type values:

1. **INSERT** `bapp_logs` type='report' — the report with feedback + rating_count + image_url, `parent_log_id` = activity ID
2. **INSERT** `bapp_logs` type='progress' — the milestone ratings `{updates: [{id, score}]}`, `parent_log_id` = report ID, `context` = 'activity'
3. **INSERT** `bapp_logs` type='observation' (optional) — if feedback text provided, `parent_log_id` = report ID, `context` = 'activity'
4. **Call** `recalculateProgress()` — updates `bapp_progress_scores` for all affected domains
5. **INSERT** `bapp_progress_history` — snapshot of current domain totals
6. **UPDATE** `bapp_logs` WHERE id = activity ID, SET `status = 'completed'`

Similarly, `logBulkProgress()` triggers:
1. **INSERT** `bapp_logs` type='progress' (context='adhoc')
2. **Call** `recalculateProgress()`
3. **INSERT** `bapp_progress_history` snapshot

And `logAdHocObservation()` with a milestone+score triggers:
1. **INSERT** `bapp_logs` type='observation' (context='adhoc')
2. **Call** `recalculateProgress()` (single update)
3. **INSERT** `bapp_progress_history` snapshot

### Progress Recalculation

`recalculateProgress(childId, updates: Array<{id, score}>)`:

1. For each update, determine the domain from `bapp_milestones`
2. Read the current `bapp_progress_scores.scores` JSONB for that domain
3. Merge the new score: `scores[milestoneId] = max(existingScore, newScore)` — scores only go up, never down
4. Recalculate percent: `round((sum_of_scores / (milestone_count × 4)) × 100)`
5. UPSERT `bapp_progress_scores` with new scores + percent
6. Write `bapp_progress_history` snapshot with per-domain score totals

---

## Backend: Server Actions

All server actions in `src/lib/actions/bapp/`.

```
src/lib/actions/bapp/
├── child-clients.ts — getChildrenForUser(), getChildDetail(), createChild(), onboardChild()
├── milestones.ts    — getMilestones(), getMilestoneDetails()
├── activities.ts    — generateActivity(), getActivity()
├── reports.ts       — submitReport() — includes report cascade
├── observations.ts  — logObservation(), logBulkProgress()
├── diary.ts         — logDiaryEntry()
├── progress.ts      — getProgressScores(), getProgressMatrix(), recalculateProgress(), getDashboardData()
├── feed.ts          — getFeed() — single-table query with self-join + context filtering
├── insights.ts      — generateInsight(), getInsights()
└── pipeline.ts      — transitionStatus() — manages child_client status transitions + events
```

### Key Implementation Notes

- **`createChild()`**: Path B — creates `child_client` + `child_client_events`. Sets `parent_lead_email` for future parent linking.
- **`onboardChild()`**: Path A — updates shell with name + DOB, sets `onboarded = true`, transitions status → `setup`.
- **`generateActivity()`**: Get child details (name, DOB → age via date diff). Get milestone details. Build prompt_context. INSERT `bapp_logs` with type='activity', status='pending'. Call OpenAI directly. UPDATE `data` with activity_json + status='ready'. On first action for a child, transition status → `active_nanny`.
- **`getFeed()`**: Single query on `bapp_logs` with self-join for parent data + join to user_profiles for author names. Context-based filtering for "All" tab. Sorted by created_at DESC.
- **`submitReport()`**: Full report cascade — see Report Cascade section above. All writes go to `bapp_logs` with different type values.
- **`recalculateProgress()`**: Merges scores, recalculates percents, writes history snapshot. Scores only go up (max of existing vs new).
- **`getProgressMatrix()`**: Reads all `bapp_progress_scores` rows for a child, merges all `scores` JSONB into a flat `{milestoneId: score}` map (matches GAS `getChildMatrixData()`). Used by MilestoneBrowser to show current mastery state.
- **`getDashboardData()`**: Returns 7 domain percents (0-100) + summary stats (total activities, observations, days active, strongest domain). Stats computed from `bapp_logs` counts by type. Matches GAS `getDashboardData()`.
- **`transitionStatus()`**: Manages allowed status transitions on `child_client` and writes timestamps to `child_client_events`.
- **Image uploads**: Use Supabase Storage (bucket: `development-images`). Upload via existing `uploadFile()` helper in `src/lib/supabase/storage.ts`. Store public URL in the entry's `data.image_url` field.

---

## Frontend: Route Structure

```
src/app/
├── nanny/
│   └── development/
│       └── [childId]/
│           ├── page.tsx               — Feed view + FAB
│           ├── progress/
│           │   └── page.tsx           — Radar chart dashboard
│           └── onboard/
│               └── page.tsx           — Name/DOB entry (Path A shells)
└── parent/
    └── development/
        └── [childId]/
            ├── page.tsx               — Feed view + FAB (full access)
            └── progress/
                └── page.tsx           — Radar chart dashboard
```

Education tab content lives in the hub components (NannyHubClient, ParentHubClient), not separate pages. Child cards navigate to `/[role]/development/[childId]`.

Shared components in `src/components/bapp/` — reused by both nanny and parent routes.

---

## Constants & Types

### Constants file: `src/lib/constants/bapp.ts`

- `DOMAINS` map: `{CL: {label: 'Communication & Language', color: 'blue'}, ...}` — 7 entries
- `MASTERY_LABELS`: `{1: 'Introduced', 2: 'Assisted', 3: 'Guided', 4: 'Independent'}`
- `MAX_MILESTONES_PER_ACTIVITY = 3`
- `FEED_POLL_INTERVAL = 10000` (10 seconds)
- `LOG_TYPES`: `['activity', 'report', 'progress', 'observation', 'diary', 'insight']`

### Types file: `src/lib/types/bapp.ts`

Key types documented in DATA-MODEL.md.

---

## Phased Build Approach

Each phase delivers a testable vertical slice. See the full Build Blueprint (`plans/purrfect-baking-hippo.md`) for complete specs.

| Phase | Deliverables | Depends On |
|---|---|---|
| **0** | Database (6 tables + RLS + seed milestones) + TypeScript types + constants | Nothing |
| **1** | Education Tab in hubs + child_client CRUD + Path A onboarding + Path B "Add New" | Phase 0 |
| **2** | BAppLayout + Feed view + FAB + Observation sheet (all 3 types) + Observation/Progress tiles | Phase 1 |
| **3** | Diary sheet (food + sleep) + Diary tile | Phase 2 |
| **4** | Plan sheet + OpenAI integration + Activity tile (pending/ready) + smart polling | Phase 2 |
| **5** | Activity detail sheet (6 accordions) + Review sheet + report cascade + progress recalculation | Phase 4 |
| **6** | Progress dashboard (radar chart + stats grid) | Phase 2 |
| **7** | Parent entry point + AI insights + polish (loading/error/empty states, mobile) | All |
