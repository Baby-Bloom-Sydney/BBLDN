> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Database Relationships & Entity Diagram

**Last Updated:** 2026-02-05
**Schema Version:** v3.0 (24 tables)

---

## ENTITY RELATIONSHIP OVERVIEW

### Core Identity Flow

```
auth.users (Supabase)
    │
    ├──► user_roles (one-to-one)
    └──► user_profiles (one-to-one)
            │
            ├──► nannies (one-to-one, if role = nanny)
            └──► parents (one-to-one, if role = parent)
```

### Nanny Domain

```
nannies
    │
    ├──► nanny_availability (one-to-one)
    ├──► nanny_credentials (one-to-many)
    ├──► nanny_assurances (one-to-many)
    ├──► nanny_images (one-to-many)
    ├──► nanny_ai_content (one-to-many)
    ├──► verifications (one-to-one)
    └──► current_placement_id ──► nanny_placements (many-to-one, current hire)
```

### Parent Domain

```
parents
    │
    ├──► nanny_positions (one-to-many, but only ONE active)
    │       │
    │       ├──► position_schedule (one-to-one)
    │       └──► position_children (one-to-many, max 3)
    │
    ├──► current_nanny_id ──► nannies (many-to-one, current hire)
    └──► current_placement_id ──► nanny_placements (many-to-one)
```

### Matching & Requests

```
nanny_positions (parent's open position)
    │
    └──► interview_requests (one-to-many)
            │
            ├── nanny_id ──► nannies (many-to-one)
            └── parent_id ──► parents (many-to-one)

babysitting_requests (parent's one-time job)
    │
    ├──► bsr_time_slots (one-to-many)
    └──► bsr_notifications (one-to-many, 20 nannies notified)
            │
            └── nanny_id ──► nannies (many-to-one)
```

### Placements (Hired Nannies)

```
nanny_placements
    │
    ├── nanny_id ──► nannies (many-to-one)
    ├── parent_id ──► parents (many-to-one)
    ├── position_id ──► nanny_positions (many-to-one, nullable)
    ├── interview_request_id ──► interview_requests (many-to-one, nullable)
    └── babysitting_request_id ──► babysitting_requests (many-to-one, nullable)
```

### Logging & Audit

```
activity_logs
    └── user_id ──► auth.users (many-to-one)

email_logs
    └── recipient_user_id ──► auth.users (many-to-one)

user_progress
    └── user_id ──► auth.users (many-to-one)

file_retention_log
    └── nanny_id ──► nannies (many-to-one)
```

---

## KEY RELATIONSHIPS EXPLAINED

### 1. User Identity (One-to-One)

```
auth.users ──► user_roles ──► user_profiles ──► nannies OR parents
```

- One user can be EITHER nanny OR parent (not both)
- Enforced by application logic + user_roles table

### 2. Nanny Verification (One-to-One)

```
nannies ──► verifications
```

- Each nanny has ONE verification record
- Tracks WWCC + passport + identity status

### 3. Nanny Credentials (One-to-Many)

```
nannies ──► nanny_credentials (multiple qualifications/certifications)
```

- One nanny can have multiple credentials
- credential_category determines if qualification or certification

### 4. Parent Positions (One-to-Many, ONE Active)

```
parents ──► nanny_positions (multiple over time, ONE active)
```

- Parent can have multiple positions in history
- Only ONE can be status='active' at a time (enforced by unique index)

### 5. Position Children (One-to-Many, Max 3)

```
nanny_positions ──► position_children (1-3 children)
```

- Each position can have 1-3 children
- Normalized (not JSONB) for structured queries

### 6. Interview Requests (Many-to-Many via Junction)

```
parents ──► interview_requests ──► nannies
```

- Parent can request interviews with many nannies
- Nanny can receive requests from many parents
- interview_requests is the junction table

### 7. Babysitting (Many-to-Many via Notifications)

```
babysitting_requests ──► bsr_notifications ──► nannies
```

- One request notifies 20 nannies
- bsr_notifications tracks who was notified
- Only one nanny accepts (first-come-first-serve)

### 8. Placements (Hired Relationships)

```
nannies ←──► nanny_placements ←──► parents
```

- Permanent record of who worked for whom
- Bidirectional references for fast lookups:
  - nannies.current_placement_id
  - parents.current_nanny_id
  - parents.current_placement_id

---

## CASCADE BEHAVIORS

### ON DELETE CASCADE (Child records deleted)

- `user_roles.user_id` → Delete role when user deleted
- `user_profiles.user_id` → Delete profile when user deleted
- `nannies.user_id` → Delete nanny record when user deleted
- `parents.user_id` → Delete parent record when user deleted
- `nanny_availability.nanny_id` → Delete availability when nanny deleted
- `position_children.position_id` → Delete children when position deleted
- All logging tables → Cascade delete

### ON DELETE SET NULL (Preserve history)

- `nanny_placements.position_id` → Keep placement even if position deleted
- `interview_requests.position_id` → Keep request history
- `activity_logs.user_id` → Keep logs even if user deleted
- `email_logs.recipient_user_id` → Keep email history

### ON DELETE RESTRICT (Prevent deletion)

- None currently (all handled by CASCADE or SET NULL)

---

## UNIQUE CONSTRAINTS

### Single-Column Unique

- `user_profiles.user_id` (one profile per user)
- `nannies.user_id` (one nanny record per user)
- `parents.user_id` (one parent record per user)
- `nanny_availability.nanny_id` (one schedule per nanny)
- `nannies.wix_contact_id` (unique Wix integration)

### Composite Unique

- `position_children(position_id, child_label)` (no duplicate child labels)
- `position_children(position_id, display_order)` (no duplicate ordering)
- `user_progress(user_id, stage)` (stage reached once per user)

### Conditional Unique (Partial Indexes)

- `nanny_positions(parent_id)` WHERE status='active' (ONE active position)
- `nanny_placements(parent_id)` WHERE status='active' (ONE active placement)
- `nanny_placements(nanny_id, parent_id)` WHERE status='active' (no duplicate active)

---

## QUERY PATTERNS

### Fast Lookups (Direct References)

```sql
-- Find parent's current nanny (no join needed)
SELECT current_nanny_id FROM parents WHERE id = ?;

-- Find nanny's current placement (no join needed)
SELECT current_placement_id FROM nannies WHERE id = ?;
```

### Full History (Join Through Junction)

```sql
-- All nannies a parent has hired
SELECT n.* FROM nanny_placements np
JOIN nannies n ON np.nanny_id = n.id
WHERE np.parent_id = ?;

-- All parents a nanny has worked for
SELECT p.* FROM nanny_placements np
JOIN parents p ON np.parent_id = p.id
WHERE np.nanny_id = ?;
```

### Matching Algorithm (Complex Joins)

```sql
-- Find verified nannies matching parent position
SELECT n.* FROM nannies n
JOIN nanny_availability na ON n.id = na.nanny_id
WHERE n.visible_in_match_making = true
  AND n.suburb = ?
  AND n.hourly_rate_min <= ?
  -- Additional filters...
```

---

## DATA FLOW EXAMPLES

### Nanny Signup → Hire

```
1. User signs up → auth.users created
2. Role assigned → user_roles created (role='nanny')
3. Profile form → user_profiles + nannies created
4. Documents uploaded → verifications updated
5. Parent requests interview → interview_requests created
6. Nanny accepts → interview_requests.status = 'accepted'
7. Interview happens → activity_logs tracks
8. Parent hires → nanny_placements created
9. References synced → nannies.current_placement_id set
                    → parents.current_nanny_id set
```

### Parent Posts Babysitting → Nanny Accepts

```
1. Parent creates request → babysitting_requests created
2. Time slots added → bsr_time_slots created
3. System finds 20 nannies → bsr_notifications created (20 rows)
4. Nanny #5 accepts first → bsr_notifications.accepted_at set
5. Other 19 notified → bsr_notifications.notified_filled = true
6. Job happens → activity_logs tracks completion
```

---

## REFERENTIAL INTEGRITY

### All Foreign Keys Have Indexes ✅

Every FK column has a corresponding index for fast joins.

### No Orphaned Records ✅

Impossible due to:
- Foreign key constraints
- Proper ON DELETE behaviors
- Database enforcement (not just app logic)

### Computed Columns ✅

Business logic enforced at database level:
- `visible_in_match_making` (can't be bypassed)
- `visible_in_bsr` (auto-calculated)
- `placement_duration_days` (always accurate)

---

## SCALABILITY CONSIDERATIONS

### Partitioning Ready

If tables grow large (10M+ rows):
- `activity_logs` → Partition by created_at (monthly)
- `email_logs` → Partition by created_at (monthly)
- `nanny_placements` → Partition by hired_at (yearly)

### Index Strategy

- All foreign keys indexed
- Partial indexes for active-only queries
- GIN indexes for JSONB columns
- Composite indexes for common filters

### Archival Strategy

- Soft deletes with deactivated_at
- File retention (5 years)
- Logs can be moved to cold storage after 1 year

---

This relationship map ensures data integrity, fast queries, and scalability to 100K+ users.
