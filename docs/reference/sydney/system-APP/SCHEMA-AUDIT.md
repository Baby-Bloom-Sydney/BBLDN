> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Schema Audit: `child_client` Against Existing Database

Audit date: 9 April 2026

Cross-referencing the planned `child_client` and `child_client_events` tables against the deployed Supabase schema to identify conflicts, gaps, and required changes before building.

---

## Tables Audited

| Table | Status | Relevance |
|---|---|---|
| `nanny_placements` | Deployed | `child_client.placement_id` FK target. Auto-creation trigger source. |
| `position_children` | Deployed | Source data for Path A auto-creation (age, gender, label). |
| `parents` | Deployed | `child_client.parent_user_id` lookup via `parents.user_id`. |
| `nannies` | Deployed | `child_client.nanny_user_id` lookup via `nannies.user_id`. RLS join path. |

---

## Finding 1: Auto-Creation Data Available from `position_children`

**What exists:**

| Column | Type | Notes |
|---|---|---|
| `age_months` | INT | 0–216 (0–18 years). This maps to `child_client.age_months_approx`. |
| `gender` | TEXT | CHECK: `'Female'`, `'Male'`, `'Rather Not Say'` |
| `child_label` | TEXT | CHECK: `'A'`, `'B'`, `'C'` |
| `display_order` | INT | 1, 2, 3 |

**What does NOT exist:** No `name` or `date_of_birth`. Only age in months and gender.

**Verdict: Confirms the shell concept.** Path A auto-creation gets `age_months_approx` and `gender` but no name/DOB. These are confirmed during app onboarding — exactly as designed.

**Action needed:** Gender mapping on auto-creation. `position_children.gender` uses `'Rather Not Say'` as a string value. `child_client.gender` uses `NULL` for prefer not to say. Map `'Rather Not Say'` → `NULL` during auto-creation.

---

## Finding 2: `nanny_placements.parent_id` is NOT NULL

```sql
parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE
```

**Impact on Path B:** We CANNOT create a placement before the parent has signed up and has a `parents` row. This aligns with our design — Path B creates the placement only when the parent signs up with the matching email. No schema change needed.

**Verdict: No conflict.** The design already accounts for this — `child_client.placement_id` is nullable, set when parent joins.

---

## Finding 3: One Active Placement Per Parent Constraint

```sql
UNIQUE (parent_id) WHERE status = 'active'
```

**Impact on Path B:** When a parent signs up via Path B (email match), creating a placement will fail if they already have an active placement from a different match.

**Risk level: Low for now.** In the current model, Path B parents are external families not on the platform — they won't have existing placements. But this becomes a consideration if a parent who's already matched through Path A is also brought in via Path B by a different nanny.

**Action needed:** Handle in server action — check for existing active placement before creating. If one exists, the linking logic needs a decision path (reject, queue, or discuss). Document as a known edge case.

---

## Finding 4: `nanny_placements.source` Needs a New Value

Current CHECK constraint:
```sql
CHECK (source IN ('interview_request', 'babysitting_job', 'direct_hire', 'referral'))
```

**Impact:** Path B placements need a source value. `'direct_hire'` is the closest fit but doesn't capture the app-initiated nature.

**Action needed:** ALTER the CHECK constraint to add a new value. Options:
- `'app_referral'` — nanny referred parent through the education app
- `'nanny_referral'` — nanny brought their own client

**Decision required:** Which value? Recommend `'nanny_referral'` as it's descriptive of Path B without being app-specific.

**Migration:**
```sql
ALTER TABLE nanny_placements DROP CONSTRAINT nanny_placements_source_check;
ALTER TABLE nanny_placements ADD CONSTRAINT nanny_placements_source_check
    CHECK (source IN ('interview_request', 'babysitting_job', 'direct_hire', 'referral', 'nanny_referral'));
```

---

## Finding 5: `nanny_placements.position_id` is Nullable

```sql
position_id UUID REFERENCES nanny_positions(id) ON DELETE SET NULL
```

**Verdict: No conflict.** Path B placements won't have a position. This being nullable works perfectly. No change needed.

---

## Finding 6: RLS Join Path Goes Through `nannies`/`parents` Tables

`nanny_placements` references `nannies.id` and `parents.id`, NOT `auth.users.id` directly. The RLS helper function must join through these tables:

```sql
-- Correct: goes through nannies table
np.nanny_id IN (SELECT id FROM nannies WHERE user_id = auth.uid())

-- Correct: goes through parents table
np.parent_id IN (SELECT id FROM parents WHERE user_id = auth.uid())
```

**Verdict: Our planned RLS function is correct.** The `user_has_child_access()` function in INTEGRATION-PLAN.md already uses this join path. No change needed.

---

## Finding 7: `nanny_user_id` on `child_client` References `auth.users` Directly

Our design has:
```sql
nanny_user_id UUID NOT NULL REFERENCES auth.users(id)
```

But `nanny_placements.nanny_id` references `nannies.id` (not `auth.users.id`).

**This is intentional and correct.** The `child_client.nanny_user_id` stores the auth user ID for direct RLS checks (`nanny_user_id = auth.uid()`). The placement join path handles the `nannies.id` ↔ `auth.users.id` mapping separately. Two access paths, two reference strategies.

**Action needed:** None. But document clearly that `child_client.nanny_user_id` is `auth.users.id`, not `nannies.id`.

---

## Finding 8: Under-Three Threshold

`position_children.age_months` ranges 0–216 (0–18 years). The milestone library covers 0–32 months.

**Decision:** Set `under_three = true` when `age_months < 36` (under 3 years old). This is a one-time flag — doesn't auto-recalculate.

**Auto-creation logic:**
```sql
under_three = (pc.age_months < 36)
```

---

## Finding 9: No Existing `child_client` or Similar Table

Checked all deployed tables — there is no existing child entity table. `position_children` stores position-level child data (age brackets for matching), but there's no "actual child" entity on the platform.

**Verdict:** `child_client` is entirely new. No migration conflicts. No data to preserve.

---

## Finding 10: Denormalized References on `parents` and `nannies`

Both tables have denormalized `current_placement_id`:
- `parents.current_placement_id` → updated by `sync_placement_references()` trigger
- `nannies.current_placement_id` → updated by same trigger

**Impact:** When Path B creates a new placement, this trigger will auto-update the denormalized references. No manual sync needed.

**But:** If the nanny already has an active placement (Path A) and we create a second one for Path B... the `nannies` table doesn't have a one-active-per-nanny constraint (only parents do). However, `nannies.current_placement_id` is singular — it'll point to the most recent one.

**Verdict: No issue.** The trigger only fires when a placement changes to `'ended'`, and only clears `current_placement_id` on the nanny/parent row that points to THAT specific placement (`WHERE current_placement_id = new.id`). A nanny with multiple active placements is fine — no DB constraint prevents it (unlike parents). The Education tab queries `child_client` by `nanny_user_id` directly, not via `nannies.current_placement_id`.

---

## Summary: Required Actions Before Building

### Must Do (Blockers)

| # | Action | Effort |
|---|---|---|
| 1 | ALTER `nanny_placements.source` CHECK to add `'nanny_referral'` | Migration, 2 lines |
| 2 | Verify `sync_placement_references()` handles multiple active placements per nanny | Read + test existing trigger |
| 3 | Map `position_children.gender` `'Rather Not Say'` → `NULL` in auto-creation logic | Code logic |

### Should Do (Edge Cases to Handle)

| # | Action | Effort |
|---|---|---|
| 4 | Email validation on "Add New" — check if parent already exists with active placement | Server action query |

**Resolved: Edge case 5 (Path B parent already has Path A placement)**
Decision: Validate upfront. When nanny enters parent email in "Add New", query existing parents. If that parent already exists on the platform with an active placement, show a message advising the nanny to ask the parent to add the child through their own account. This avoids hitting the one-active-placement-per-parent constraint and gives the nanny a clear explanation. See BUSINESS-LOGIC.md for full reasoning.

### Already Correct (No Changes Needed)

| # | Finding |
|---|---|
| 6 | `position_children` provides age_months + gender for auto-creation (no name/DOB — confirms shell design) |
| 7 | `nanny_placements.parent_id` NOT NULL — aligns with "create placement only when parent joins" |
| 8 | `nanny_placements.position_id` nullable — Path B placements have no position |
| 9 | RLS join path through `nannies`/`parents` tables — our helper function is correct |
| 10 | `child_client.nanny_user_id` as `auth.users.id` — correct for direct RLS checks |
| 11 | No existing child entity table — clean slate, no migration conflicts |
| 12 | Denormalized `current_placement_id` auto-synced by existing trigger |
