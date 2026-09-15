> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Business Logic & Design Decisions

This document captures the reasoning behind every architectural and business decision for the Baby Bloom education app. Each section records what was decided, why, and the alternatives that were considered.

---

## Revenue Model

### Decision: Matchmaking is free. The app is the product.

The matchmaking website exists as a free acquisition channel. Every nanny who signs up through the website is a potential distribution channel for the paid education product. The app funds the matchmaking operation.

### Pricing

- **Monthly subscription** — standard rate for parents
- **Upfront payment** — significant discount, framed as a "courtesy for your Baby Bloom nanny"

### Nanny Commission

- Approximately 50% of the service fee
- Paid roughly 31 days after the parent's purchase (61–68 days from the start of the trial)
- Ballpark: ~$1,000 per conversion
- **Reasoning**: The nanny has a direct financial incentive to use the app consistently and well. The more value the parent sees through notifications, the more likely they are to convert. The nanny's daily usage IS the sales pitch.

### 30-Day Free Trial

- Starts when the parent signs up (not when the child is created)
- Full access for both nanny and parent throughout
- At expiry, parent is prompted to purchase
- **Reasoning**: The parent needs to experience the value before paying. The nanny has already been building up content (activities, observations, diary) before the parent even joins, so the parent walks into a rich feed from day one.

---

## Two Nanny Paths

### Decision: Support both matched and unmatched nannies.

#### Path A — Matched Nanny
Nanny signs up → Baby Bloom matches them → placement created → child_client auto-generated → phone call to onboard → nanny enters app.

#### Path B — Bring Your Own Parent (BYO)
Nanny signs up → no match available → Baby Bloom calls and offers alternative: sign up their existing clients → nanny creates child manually with parent's email → uses app → parent gets pulled in.

### Reasoning

Path B is critical because:
1. Not every nanny will get matched immediately
2. Unmatched nannies are still potential distribution channels
3. The nanny already has a relationship with a parent — Baby Bloom just needs to facilitate the app adoption
4. Every child a nanny onboards is a potential commission

### Onboarding Method: Phone Calls

Both paths are onboarded via phone call. This is intentional:
- Keeps the process human-led while the business model is being validated
- Phone calls serve as a learning mechanism to understand nanny motivations and friction points
- Will be systemised later once patterns are clear
- **Not building** automated onboarding flows yet

---

## Child-Level Access (Not Position-Level)

### Decision: The app entry point is per-child, not per-position.

### Reasoning

The app is fundamentally child-centric. Every action (plan activity, log observation, record diary) is about one specific child. The feed is per-child. The progress radar is per-child.

**Position is the access gate, child is the entry point.** The position/placement proves you have permission to see this child. But once you're in, you're in that child's world — not the position's.

**Scaling**: If a position has 2 children later, each child is still its own app instance with its own feed, progress, and milestones. Nothing changes architecturally — you just get more child cards on the Education tab.

### Alternative Considered

Position-level access where you enter "a position" and see all children. Rejected because:
- The prototype is designed for one child at a time
- Mixing multiple children's feeds would be confusing
- Per-child URLs are cleaner and more bookmarkable

---

## `child_client` as Central Entity

### Decision: Create a comprehensive `child_client` table that bridges matchmaking and education.

### Reasoning

This table is a business entity, not just an app data record. It represents a child as a client of Baby Bloom. It needs to:
- Exist before the app is used (auto-created from placements)
- Work without a placement (Path B, before parent signs up)
- Track pipeline status for business metrics
- Hold identity data (name, DOB, gender)
- Link to both nanny and parent

### Table Name

`child_client` (not `dev_children`) — positions it as a core platform entity, not just education app data.

### Key Fields and Why

| Field | Why |
|---|---|
| `nanny_user_id` | Always set. The nanny who manages this child. Enables access before any placement exists (Path B). |
| `parent_user_id` | Nullable. Set when parent is on the platform. NULL for Path B pre-signup. |
| `parent_lead_email` | Path B only. The email the nanny provides. Used to match and link when the parent eventually signs up. |
| `placement_id` | Nullable. Path A: set immediately. Path B: set when parent joins and placement is created. |
| `age_months_approx` | From position_children. Before exact DOB is confirmed in app onboarding. |
| `under_three` | One-time boolean flag set at creation. NOT auto-recalculated from age. Gates Education tab visibility. A child turning 3 doesn't suddenly disappear. |
| `onboarded` | Whether name + DOB have been confirmed in the app. Path A shells start as false. Path B starts as true (nanny enters details upfront). |
| `gender` | Nullable. NULL = prefer not to say. No separate "prefer not to say" option value needed. |

---

## Placements Stay as the Link Entity

### Decision: Don't modify the existing `nanny_placements` table. Use it as-is.

### Reasoning

The placement is the entity that links a nanny to a parent. This is already established and deployed. Rather than adding child ID columns to placements or modifying its schema:
- `child_client` references `placement_id` (child → placement, not placement → child)
- Query children by `WHERE placement_id = X`
- This is a standard FK relationship, no schema changes to an existing table

### Alternative Considered

Adding `child_1_id`, `child_2_id`, `child_3_id` columns to `nanny_placements`. Rejected because:
- Fixed columns limit flexibility
- Requires altering a deployed table
- Standard FK from child to placement is cleaner and more queryable

---

## Path A Auto-Creation from Placements

### Decision: When a placement is created, automatically generate `child_client` for ALL children on the position.

### Rules

1. Read `position_children` for the matched position
2. Create a `child_client` row for **every** child (not just under-3s)
3. Set `under_three = true` for children under 36 months (one-time, at creation)
4. Only children with `under_three = true` appear in the Education tab
5. Shell children have no name or DOB — these are confirmed when someone first enters the app

### Reasoning

- All children deserve a `child_client` record for platform completeness
- The `under_three` flag gates app visibility without excluding children from the broader platform
- Shell state (no name/DOB) is intentional — we know the child exists and their approximate age from the position, but precise details wait for the app onboarding moment
- Pre-populated approximate age and gender from position data reduce the onboarding friction

---

## Dual-Path RLS (Not Placement-Only)

### Decision: Access is via `nanny_user_id = auth.uid()` OR placement membership.

### Reasoning

Path B creates a child before any placement exists. The nanny needs immediate access to use the app. Two access paths:
1. **Direct ownership**: `nanny_user_id = auth.uid()` — works always, even without a placement
2. **Placement membership**: works for both nanny and parent once placement exists

### Why Not Placement-Only

If RLS required a placement, Path B nannies couldn't use the app until the parent signed up and a placement was created. That would block the entire value proposition — the nanny using the app to build content that pulls the parent in.

---

## Both Roles Get Full Access

### Decision: Parents have identical app capabilities to nannies. No read-only restriction.

### Prototype vs Production

The prototype had Guardian as read-only. The production version gives parents full access — same FAB, same action sheets, same tools.

### Reasoning

- The child is a shared entity. Both parties contribute to the child's developmental record.
- Parents observing and logging their own activities creates more value and engagement.
- Author attribution on every feed entry keeps things transparent — you can see who did what.
- Restricting parents to read-only would make the app feel like a surveillance tool rather than a collaborative platform.

---

## Separate Events Table (Timestamp Columns)

### Decision: Track pipeline stages via `child_client_events` — one row per child, every status is a nullable timestamp column.

### Schema Pattern

```
child_client_events
├── child_client_id     UUID (UNIQUE — one row per child)
├── created_auto_at     TIMESTAMPTZ, nullable
├── created_manual_at   TIMESTAMPTZ, nullable
├── setup_at            TIMESTAMPTZ, nullable
├── active_nanny_at     TIMESTAMPTZ, nullable
├── trial_at            TIMESTAMPTZ, nullable
├── trial_ended_at      TIMESTAMPTZ, nullable
├── active_at           TIMESTAMPTZ, nullable
├── closed_at           TIMESTAMPTZ, nullable
```

### Reasoning

- One row per child. No aggregation needed.
- NULL = hasn't reached that stage. Filled = when they hit it.
- Time-in-stage is simple arithmetic: `trial_at - active_nanny_at`
- Drop-off queries are simple: `WHERE active_nanny_at IS NOT NULL AND trial_at IS NULL`
- No GROUP BY, no window functions, no complex joins for reporting
- `child_client.status` holds the current state for quick filtering. This table is the history.

### Alternative Considered

1. **Log table (one row per status change)**: Rejected — requires aggregation for every metric query. More rows to manage.
2. **Status + single timestamp on child_client**: Rejected — loses all history. Can't compute time-in-stage.
3. **Timestamps as columns ON child_client**: Considered but rejected — separating concerns keeps the main table clean and focused on identity/relationships.

---

## Status Pipeline Definitions

| Status | Trigger | Meaning |
|---|---|---|
| `created_auto` | Placement created (system) | Shell child generated from position. No name/DOB yet. |
| `created_manual` | Nanny taps "Add New" | Nanny created child for their own client. Has full details. |
| `setup` | Name/DOB confirmed in app | App onboarding complete. Ready to use. |
| `active_nanny` | First app action (activity/observation/diary) | Nanny is actively using the app. Parent hasn't signed up yet. This is the critical "building value" phase. |
| `trial` | Parent signs up | Parent signed up with matching email. 30-day free trial starts. |
| `trial_ended` | 30 days elapsed | Trial expired. Awaiting conversion decision. |
| `active` | Parent pays | Subscription live. Nanny commission clock starts. |
| `closed` | Manual or churn | Ended for any reason — cancelled, aged out, churned. |

### Why `created_auto` and `created_manual` are separate

Differentiates the two entry paths for analytics without needing an extra field. Tells you immediately whether this child came through matchmaking or BYO.

### Why `active_nanny` exists

This is arguably the most important funnel stage. It represents the gap between setup and trial — where the nanny is building value and the parent is receiving notifications but hasn't signed up yet. Tracking time-in-stage here tells you how long it takes nanny activity to convert parent interest.

---

## Path B Email Validation (Existing Parent Guard)

### Decision: When nanny enters a parent email in "Add New", validate it before proceeding.

### Logic

1. Nanny enters parent's email in the "Add New" child creation flow
2. System checks: does this email belong to an existing user with an active placement?
3. If **yes** → block creation, show message: *"This parent is already on Baby Bloom. Ask them to add your child through their account."*
4. If **no** → proceed with Path B normally

### Reasoning

- The database has a `UNIQUE (parent_id) WHERE status = 'active'` constraint on `nanny_placements` — only one active placement per parent
- If a Path B parent already has an active Path A placement, creating a second placement would violate this constraint
- Rather than hitting a DB error, we validate upfront and give the nanny a clear explanation
- This also guides the correct behaviour — the parent should add children through their own account if they're already on the platform
- Later, when parent-initiated child creation is built, this edge case resolves naturally

---

## AI Activity Generation

### Decision: Direct OpenAI calls replace the Make.com webhook.

### Background

The GAS prototype uses an async pipeline: `generateActivity()` creates a PENDING log entry → fires a Make.com webhook with `{childId, childName, childAgeMonths, promptContext, milestoneIds}` → Make.com calls OpenAI → writes the AI response back to the spreadsheet → frontend polls at 10s intervals until the activity resolves.

### Decision

Call OpenAI directly from a Next.js server action using the existing client at `src/lib/ai/client.ts` (50s timeout). The call is synchronous within the server action — no webhook, no callback, no external orchestrator.

### Reasoning

- Make.com was a prototyping convenience — it allowed the GAS backend to avoid managing OpenAI API keys and complex async logic
- In the Next.js platform, we already have an OpenAI client configured with proper auth
- A direct call is simpler, faster (no webhook overhead), and easier to debug
- The frontend still supports the pending → ready polling pattern as a fallback if the call times out (>50s)
- Prompt design is controlled in our codebase, not locked in a third-party automation tool

---

## Feed Hierarchy (Context System)

### Decision: Reports and progress updates create child observation entries that are hidden from the main feed's "All" view.

### Background

The GAS prototype uses a `context` field on every log entry with 3 values:
- `ADHOC` — standalone entry, shows in feed
- `ACTIVITY` — child of an activity report, hidden from "All" tab
- `ASSESSMENT` — child of a progress update, hidden from "All" tab

When `submitActivityReport()` runs, it creates multiple log entries: the REPORT itself, plus PROGRESS and OBSERVATION child entries for the actual milestone score updates. Without the context system, the feed would show duplicate information — the Report tile already displays the mastery ratings inline, so the individual progress/observation entries would be noise.

### Decision

Preserve the context system exactly. `bapp_logs` has a `context` column with 3 values: 'adhoc', 'activity', 'assessment'. The "All" feed tab only shows entries where `context = 'adhoc'`. Type-specific filter tabs show everything regardless of context.

### Reasoning

- Prevents duplicate noise in the feed (a single report creates N child entries — without context filtering, a 3-milestone activity report would create 4+ feed entries for one action)
- Keeps the detailed records for data integrity — progress scores need the individual observation rows
- Type-specific filters (Obs, Growth) still provide access to all entries when needed
- Matches the prototype's proven UX — users expect the "All" tab to show one entry per user action, not the cascade of backend writes

---

## What Is NOT Being Built Yet

- Automated onboarding (no self-serve signup flow for the app — phone calls only)
- Notification strategy details (content, frequency, what's shown vs gated)
- Multiple children per parent
- Commission tracking dashboard
- Payment/subscription infrastructure
- Systemised nanny outreach for Path B
- Parent ability to add children (nanny-only for now)
