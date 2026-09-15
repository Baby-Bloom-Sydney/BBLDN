> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# User Flows

## Entry Points

Both nannies and parents access the app through an **"Education" tab** in their hub.

---

## Nanny Flows

### Education Tab (Hub)

```
Nanny Hub → Education tab
  ├── Child cards grid (one card per child_client WHERE under_three = true)
  │   ├── Onboarded child: shows name + age + status badge
  │   └── Shell child (Path A): shows "Child 1 — ~8 months" + "Set up" prompt
  └── "Add New" button (Path B: bring your own parent)
```

### Path A — Enter Existing Child (Auto-Created from Placement)

```
Education tab → Tap shell child card
  └── Onboarding sheet
      ├── Pre-filled: approximate age, gender (from position data)
      ├── Enter: first name, date of birth
      ├── Confirm
      │   ├── child_client updated: onboarded = true, name + DOB set
      │   ├── Status: created_auto → setup
      │   └── child_client_events.setup_at = NOW()
      └── App opens for this child
```

### Path B — Add New Child (BYO Parent)

```
Education tab → Tap "Add New"
  └── Add child sheet
      ├── Enter: first name, date of birth, gender
      ├── Enter: parent's email address (critical link)
      ├── Confirm
      │   ├── child_client created: nanny_user_id set, parent_lead_email set
      │   ├── onboarded = true, under_three = true
      │   ├── Status: created_manual
      │   ├── No placement_id yet (created when parent signs up)
      │   └── child_client_events.created_manual_at = NOW()
      └── App opens for this child
```

### Main Navigation (Inside App)

Two views accessible via bottom nav bar:
- **Feed** (home icon) — Timeline of all activity
- **Progress** (chart icon) — Radar chart dashboard

### Plan Activity

```
Tap FAB (+) → Tap "Plan Activity"
  └── Plan Modal opens (full-screen)
      ├── Browse milestone accordion (grouped by domain → age)
      ├── Tap milestone to select (tag appears at top)
      │   ├── Max 3 milestones
      │   ├── Tap tag X to deselect
      │   └── At 3: selector hides, "Ready to Generate!" message shown
      ├── Footer appears with "Create Activity" button
      └── Tap "Create Activity"
          ├── API: generateActivity (sends childId + milestone IDs)
          ├── Modal closes
          ├── Feed shows "Generating..." pending tile
          ├── Status: setup → active_nanny (if first action for this child)
          └── Smart polling (10s) until AI response resolves
              └── Pending tile becomes full Activity tile
```

### View Activity Detail

```
Feed → Tap "View Activity" on any Activity tile
  └── Activity Detail modal opens (full-screen)
      ├── Header: creativeName + recommendedLine
      ├── activityDescription paragraph
      ├── 6 Accordion sections (from activity_json):
      │   ├── 1. Objectives (objectivesList[] — learning objectives)
      │   ├── 2. Intention (intention — developmental purpose)
      │   ├── 3. You Will Need (supplies[] + suppliesDisclaimer)
      │   ├── 4. Step-by-Step (activityGuide[] — numbered steps)
      │   ├── 5. Encouragement (encouragementTips[])
      │   └── 6. What to Watch For (keyObservations[] — per-domain observation guides
      │       with descriptions for each of the 4 mastery levels:
      │       Introduced / Assisted / Guided / Independent)
      └── Bottom CTA: "Complete & Report" (if status='ready')
```

### Complete Activity (Report)

```
Activity Detail → Tap "Complete & Report"
  └── Review drawer slides up (85vh)
      ├── Activity title header
      ├── For each targeted milestone:
      │   ├── Domain badge + milestone description
      │   └── 2x2 grid of mastery buttons:
      │       Introduced | Assisted
      │       Guided     | Independent
      │       (tap to select, green highlight)
      ├── Notes textarea (optional)
      ├── Evidence photo upload (optional, Supabase Storage)
      └── Tap "Submit Report"
          ├── If photo: "Uploading Evidence..." → upload to Supabase Storage
          ├── API: submitReport → REPORT CASCADE:
          │   ├── 1. Report row saved
          │   ├── 2. Child observations created (context='activity', hidden from All feed)
          │   ├── 3. Progress scores recalculated for affected domains
          │   ├── 4. History snapshot written
          │   └── 5. Activity marked 'completed'
          ├── Drawer closes
          └── Feed + Progress views refresh
```

### Log Observation

```
Tap FAB (+) → Tap "Observation"
  └── Log drawer opens (85vh)
      ├── Step 1: Choose type
      │   ├── [General] → Step 2a
      │   ├── [Focused] → Step 2b
      │   └── [Progress] → Step 2c
      │
      ├── Step 2a: General
      │   ├── Photo upload (optional)
      │   ├── Freeform textarea
      │   └── Tap "Save Observation"
      │       └── API: logAdHocObservation (domain="General", no milestone)
      │
      ├── Step 2b: Focused
      │   ├── Domain dropdown (multi-select via repeated add)
      │   ├── Active domain tags (tap X to remove)
      │   ├── Photo upload (optional)
      │   ├── Observation textarea (appears after first domain selected)
      │   └── Tap "Save Observation"
      │       └── API: logAdHocObservation (domain=comma-joined, optional milestone+score)
      │
      └── Step 2c: Progress
          ├── Full milestone accordion (domain → age → milestones)
          ├── Tap milestone → expand 4-button mastery selector
          ├── Select score → milestone card turns green with badge
          ├── Footer appears: "Add Progress"
          ├── Tap "Add Progress" → Summary + Note step
          │   ├── Summary of selected milestones + scores
          │   ├── Photo upload (optional)
          │   ├── Optional note textarea
          │   ├── "Skip Note" link (submits without note)
          │   └── "Add Observation" button
          └── API: logBulkProgress (updates array + note + imageUrl)
```

### Log Diary Entry

```
Tap FAB (+) → Tap "Diary Entry"
  └── Diary drawer opens (85vh)
      ├── Step 1: Choose type
      │   ├── [Food] → Step 2a
      │   └── [Sleep] → Step 2b
      │
      ├── Step 2a: Food
      │   ├── Entry type dropdown: Meal / Snack / Bottle
      │   ├── If Meal or Snack:
      │   │   ├── "What did they have?" textarea
      │   │   └── Time input
      │   ├── If Bottle:
      │   │   ├── Quantity dropdown (30ml–240ml in 30ml increments)
      │   │   └── Time input
      │   └── Tap "Log Food"
      │       └── API: logDiaryEntry (type="Food", entryData={subtype, details/quantity, time})
      │
      └── Step 2b: Sleep
          ├── Start time input ("Went to Sleep")
          ├── End time input ("Woke Up")
          ├── Auto-calculated duration display (handles overnight)
          ├── Notes textarea (optional)
          └── Tap "Log Sleep"
              └── API: logDiaryEntry (type="Sleep", entryData={start, end, duration, notes})
```

### View Progress Dashboard

```
Bottom nav → Tap chart icon
  └── Progress view
      ├── Radar chart (recharts)
      │   ├── 7 axes: CL, PSE, PD, LIT, NUM, UW, EAD (0-100% per domain)
      │   ├── Formula per domain: round((sum_of_scores / (milestone_count × 4)) × 100)
      │   ├── "Live" badge
      │   └── Data from: getDashboardData()
      └── Stats grid (2-column)
          ├── Total activities
          ├── Total observations
          ├── Days active
          └── Strongest domain
```

---

## Parent Flows

### Education Tab (Hub)

```
Parent Hub → Education tab
  └── Single child card (no selector, no "Add New")
      ├── Child was added by the nanny (or auto-created from placement)
      └── Tap → enters child's app view
```

Parents see **one child** — the child was registered by the nanny. No child selector, no "Add New" button. The parent's entry is simpler.

### Parent Sign-Up (Path B — Pulled In by Nanny Activity)

```
Parent receives notification (email/SMS — strategy TBD)
  ├── Shows: nanny activity with their child
  ├── Prompts: sign up using the email the nanny registered
  └── Parent signs up on babybloomsydney.com.au
      ├── System matches parent_lead_email → child_client
      ├── Placement created linking nanny ↔ parent
      ├── child_client.placement_id set
      ├── child_client.parent_user_id set
      ├── Status: active_nanny → trial
      ├── child_client_events.trial_at = NOW()
      └── 30-day trial begins
```

### Using the App (Full Access)

Parents have **identical app capabilities** to nannies:
- Plan activities, complete & report
- Log observations (all 3 types)
- Record diary entries (food & sleep)
- View feed timeline and progress dashboard
- FAB with all 3 action buttons

All feed entries show **author attribution** — who created each entry (nanny vs parent). Both parties see everything. There is no separation of access.

### Trial Period

```
30-day countdown from parent sign-up
  ├── Full access for both nanny and parent throughout
  ├── At 30 days:
  │   ├── Status: trial → trial_ended
  │   ├── child_client_events.trial_ended_at = NOW()
  │   └── Parent prompted to purchase (monthly or upfront)
  └── If parent converts:
      ├── Status: trial_ended → active
      ├── child_client_events.active_at = NOW()
      └── ~31 days later: nanny receives commission (~$1,000)
```

---

## Feed Filtering Logic

The feed supports 5 client-side filter modes. **Context-based visibility** controls what appears in the "All" tab.

| Filter | Shows Types | Context Rule |
|---|---|---|
| All | Everything EXCEPT hidden child entries | Only observations with context='adhoc' are shown. Observations with context='activity' or context='assessment' are hidden (they're child records of reports/progress updates). |
| Activities | ACTIVITY + REPORT | All, regardless of context |
| Obs | OBSERVATION | All, regardless of context |
| Growth | PROGRESS observations + DIARY | All, regardless of context |
| Insights | INSIGHT | All |

### Why Context Matters

When a user submits an activity report, the report cascade creates child observation entries for each rated milestone (with context='activity'). These exist for data integrity (they update progress scores) but would create duplicate noise in the feed since the Report tile already shows the mastery ratings inline. The context system prevents this duplication while keeping the detailed records accessible through type-specific filter tabs.

Similarly, bulk progress updates (context='assessment') are standalone entries that show in "All", but any child entries they create are hidden.

### Smart Polling

When the feed contains an Activity with status='pending' (AI still generating), the frontend polls every 10 seconds until the activity resolves to status='ready'. The pending tile shows a spinner and "Generating..." message. Once resolved, it becomes a full Activity tile with the AI-generated plan.

---

## Modal Navigation Pattern

All modals use a consistent pattern:
1. **Drawer style** — slides up from bottom, 85vh height, rounded top corners
2. **Drag handle** — 12px pill at top, tappable to close
3. **Header** — title + back button (when in sub-step) + close X
4. **Back button** — returns to step 1 (type selection), hidden on step 1
5. **Content area** — scrollable overflow
6. **Submit button** — shows loading spinner → success animation (green pulse, 800ms) → auto-close
