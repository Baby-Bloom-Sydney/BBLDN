> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# Baby Bloom Workflow Blueprint
## Information Presentation Order — Designed to Compel Compliance

**Purpose**: This document maps the optimal order for collecting information from nannies and parents, designed to maximize form completion rates through proven UX psychology.

**Sources**: Form specs (`/forms/`), OLD system GAS scripts, matching algorithm requirements, current app implementation.

---

## NANNY JOURNEY: Signup → Profile → Verification → Tier Progression

### The Compliance Psychology

The nanny form is 9 steps. The order is designed around three principles:
1. **Start with identity** (easy, quick, establishes commitment)
2. **Middle steps = professional value** (nanny feels empowered choosing preferences)
3. **End with high-effort personal items** (photo, written responses — by now they're invested)

Each step should take under 2 minutes. Total target: 12-15 minutes.

---

### STEP 1: BASIC INFORMATION
**Psychology**: Zero friction entry. Just your name and contact. Everyone can do this in 30 seconds.
**Matching value**: Enables contact and basic identification.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| First Name | text | YES | spec + OLD | Title-cased on save |
| Last Name | text | YES | spec + OLD | Title-cased on save |
| Email Address | email | YES | spec + OLD | CITEXT in DB, used for all comms |
| Phone Number | tel | YES | spec + OLD | Format: 0 XXX XXX XXX (Australian) |
| Current Location/Suburb | text | YES | spec | Free text, e.g. "Bondi" |

**What this unlocks**: We can save progress, contact them if they abandon.
**Current app gap**: Missing email field. Has DOB and nationality here (too early — moved to step 7/8).

---

### STEP 2: EXPERIENCE LEVEL
**Psychology**: Professional identity. Nannies want to showcase their experience. This feels good.
**Matching value**: HIGH — Experience is 25% of matching score. Qualifications are 20%.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Total Experience (years) | dropdown | YES | OLD + spec | 0-1, 1-3, 3-5, 5-10, 10+ |
| Nanny-Specific Experience (years) | dropdown | YES | OLD | Subset of total experience |
| Under-3 Experience (years) | number | NO | OLD | Used in child age bracket matching |
| Newborn Experience (years) | number | NO | OLD | Used in child age bracket matching |
| Age Groups Experienced With | multi-select | YES | spec | Newborn, Toddler, School-age, etc. |
| Formal Qualifications | multi-select | YES | spec + OLD | Cert III, IV, Diploma, Bachelor — hierarchy logic |
| Certifications | multi-select | YES | OLD | CPR, First Aid, First Aid in Edu & Care, Child Protection |
| First Aid Current | yes/no | YES | spec | Quick confirmation |
| Experience Details | textarea | NO | OLD | Brief description of experience |

**Matching formula impact**:
- Experience → 25 points max (base scoring)
- Qualifications → up to 11 bonus points (Cert III: 3, IV: 4, Diploma: 5, Bachelor: 6)
- Certifications → bonus points (CPR: 1, First Aid: 0.5, FA Edu: 1, Child Protection: 1.5)

**Current app gap**: Missing age groups, formal qualifications, certifications. Has experience_details and under-3/newborn (good — from OLD system).

---

### STEP 3: AVAILABILITY & SCHEDULE
**Psychology**: Practical and empowering — "when do YOU want to work?" Nanny is defining their ideal life.
**Matching value**: CRITICAL — Schedule coverage is a gatekeeper AND a multiplier.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Weekly Availability Grid | interactive grid | YES | spec + OLD | Mon-Sun × 4 slots: Morning (6-10), Midday (10-2), Afternoon (2-6), Evening (6-10) |
| Preferred Working Hours | multi-select | YES | spec | Morning, Afternoon, Evening, Overnight |
| Start Date | date picker | YES | spec + OLD | When can you start? |
| Immediate Start Available | toggle | NO | OLD | Quick flag for urgent matching |
| Flexibility | select | YES | spec | Full-time, Part-time, Casual, Any |
| Placement Preference | radio | NO | OLD | Ongoing vs. until a date |

**Matching formula impact**:
- Availability overlap is a GATEKEEPER (must have at least 1 matching slot)
- Schedule coverage multiplier: 100% = 1.0x, 90% = 0.9x, 80% = 0.8x, 70% = 0.4x
- Schedule flexibility gives up to 1.5x boost

**Current app gap**: Missing weekly availability grid (critical!), preferred hours, flexibility. Has immediate_start and placement_ongoing (good). The grid is the most important missing piece — it's central to matching.

---

### STEP 4: PREFERENCES & REQUIREMENTS
**Psychology**: Still empowering — "what kind of family do you want?" Nanny feels in control.
**Matching value**: Rate is 30% of matching score (highest single factor).

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Hourly Rate Minimum | select | YES | spec + OLD | $35, $40, $45, $50 brackets — nanny's minimum |
| Pay Frequency | multi-select | NO | OLD | Daily, Weekly, Fortnightly, Monthly |
| Max Number of Children | number | YES | OLD + spec | Capacity check in matching |
| Child Age Preference | range select | YES | spec | Preferred age ranges |
| Special Needs Experience | yes/no + details | YES | spec + OLD | Affects matching as gatekeeper |
| Role Types Preferred | multi-select | YES | OLD | Nanny, Babysitter, After School Care, Night Nanny, etc. |
| Level of Support Offered | multi-select | YES | OLD | Supervision, Engagement, Educational, Developmental |
| Household Tasks Willing | multi-select | YES | spec | Cooking, Cleaning, Laundry, etc. |

**Matching formula impact**:
- Rate → 20 points max (nanny rate ≤ parent rate = 75% base + savings bonus)
- Capacity → gatekeeper (nanny max ≥ parent's children count)
- Level of support → up to 4 bonus points
- Child age → 0.1x penalty per bracket difference

**Current app gap**: Missing household tasks, child age preference. Has role_types, level_of_support, pay_frequency (good).

---

### STEP 5: LOCATION & TRAVEL
**Psychology**: Geographic preferences — still practical, still empowering.
**Matching value**: Distance is a multiplier (under 5km = 1.0x, over 30km = 0.5x).

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Preferred Work Areas | multi-select | YES | spec | Sydney suburbs — could be dropdown of known suburbs |
| Maximum Travel Distance | select | YES | spec | KM radius: 5, 10, 15, 20, 30, 50 |
| Driver's License | yes/no | YES | spec + OLD | Gatekeeper in matching |
| Car Access | yes/no | YES | spec + OLD | 1.5x distance boost if has car |
| Public Transport Access | yes/no | NO | spec | Useful context for parents |

**Matching formula impact**:
- Distance calculated via Haversine from nanny suburb to job suburb
- Has car → 1.5x distance multiplier (capped at 1.0)
- Driver's license → gatekeeper if parent requires it

**Note**: The spec puts driver's license and car in step 7 ("Helpful Information"), but they make more sense here with location/travel. The OLD system groups them with transport data too.

**Current app gap**: Missing preferred work areas, max travel distance, public transport. Has drivers_license and has_car but in "About You" step (should move here).

---

### STEP 6: EMERGENCY & REFERENCES
**Psychology**: Higher commitment ask, but by step 6 the nanny is invested (sunk cost). This feels like "real paperwork" which signals professionalism.
**Matching value**: References are a bonus factor (1 point in matching). Also required for compliance.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Emergency Contact Name | text | YES | spec | Required for safety compliance |
| Emergency Contact Phone | tel | YES | spec | Required for safety compliance |
| Reference 1 - Name | text | YES | spec + OLD | Professional reference |
| Reference 1 - Phone | tel | YES | spec + OLD | |
| Reference 1 - Relationship | text | YES | spec | e.g. "Former employer" |
| Reference 2 - Name | text | NO | spec + OLD | Second reference optional |
| Reference 2 - Phone | tel | NO | spec + OLD | |
| Reference 2 - Relationship | text | NO | spec | |

**Matching formula impact**: References → 1 bonus point if provided.

**Current app gap**: This entire step is missing. No emergency contacts, no references at all.

---

### STEP 7: HELPFUL INFORMATION
**Psychology**: Quick yes/no checkboxes. Feels fast after the heavier step 6. "Almost done" energy.
**Matching value**: Several gatekeepers (vaccination, non-smoker) and compatibility factors.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Date of Birth | date picker | YES | spec + OLD | 18+ validation, used for age matching |
| Languages | multi-select | YES | spec + OLD | English, Foreign Language, Multiple |
| Other Languages (conditional) | text | conditional | spec | Appears if "Foreign Language" selected |
| Comfortable with Pets | yes/no | YES | spec + OLD | Parent compatibility factor |
| Vaccination Status | yes/no | YES | spec + OLD | Parent may require |
| Non-Smoker | yes/no | YES | spec + OLD | Parent may require |

**Note**: Driver's license and car moved to Step 5 (Location & Travel) where they logically belong. DOB moved here from current app's Step 1 — it's sensitive and shouldn't be asked upfront.

**Current app gap**: All these fields exist but are crammed into "About You" step 6. Need to separate them out.

---

### STEP 8: RESIDENCY DETAILS
**Psychology**: Nationality and residency can feel sensitive. Asking this late (step 8 of 9) means they're almost done and won't abandon over it.
**Matching value**: Sydney residency determines if suburb/postcode are collected (needed for geolocation matching).

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Nationality | combobox/dropdown | YES | spec | 200+ countries with search |
| Residency Status | select | YES | OLD | Australian Citizen, Permanent Resident, Visa holder |
| Right to Work | yes/no | YES | OLD | Legal requirement |
| Sydney Resident | yes/no | YES | spec + OLD | TRIGGERS conditional fields below |
| Suburb (conditional) | text | YES if Sydney | spec + OLD | Title-cased, used for geolocation |
| Postcode (conditional) | text | YES if Sydney | spec + OLD | Used for lat/lng lookup via sydney_postcodes table |

**Matching formula impact**: Suburb + postcode → Haversine distance calculation. This is used for the distance multiplier AND the babysitting proximity search (top 20 closest Tier 3 nannies).

**Current app gap**: Has nationality, residency_status, sydney_resident, right_to_work, suburb, postcode — but all in Step 1 (Basics). Too early. Should be Step 8.

---

### STEP 9: ABOUT YOU
**Psychology**: The big finish. Photo upload + creative writing. Highest effort, but the nanny is fully invested (8 steps complete). The photo and personal descriptions make them feel like a REAL profile is being created. Ending with a confirmation checkbox creates a sense of completion.
**Matching value**: Profile picture and bios are crucial for parent browsing. AI bio is generated from these + all prior data.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Profile Picture | file upload | YES | spec + OLD | Photo for profile card. Drag-drop + preview. |
| Hobbies & Interests | textarea | YES | spec + OLD | Fed to AI bio generator |
| Strengths & Traits | textarea | YES | spec + OLD | Fed to AI bio generator |
| Specialised Skills & Training | textarea | YES | spec + OLD | Fed to AI bio generator |
| Accuracy Confirmation | checkbox | YES | spec | "I confirm all information is accurate" |

**Post-submission**: All form data → AI bio generation (GPT-4o) → Profile published at Tier 1 → Nanny guided to verification form.

**Current app gap**: Missing profile picture upload, accuracy confirmation. Has the three textarea fields.

---

### STEP SUMMARY: NANNY REGISTRATION

| Step | Name | Fields | Time | Psychology |
|------|------|--------|------|-----------|
| 1 | Basic Information | 5 | 30s | Zero friction entry |
| 2 | Experience Level | 9 | 2min | Professional pride |
| 3 | Availability & Schedule | 6 | 2min | Defining ideal schedule |
| 4 | Preferences & Requirements | 8 | 2min | Choosing ideal family |
| 5 | Location & Travel | 5 | 1min | Defining work zone |
| 6 | Emergency & References | 8 | 2min | Professionalism signal |
| 7 | Helpful Information | 6 | 1min | Quick checkboxes |
| 8 | Residency Details | 6 | 1min | Sensitive but almost done |
| 9 | About You | 5 | 3min | Investment payoff |
| **Total** | | **~58 fields** | **~15min** | |

---

## NANNY JOURNEY: Verification Form (Post-Registration)

**Trigger**: After profile creation, nanny is guided to verify identity.
**Purpose**: Progress from Tier 1 → Tier 2.
**Psychology**: They just created their profile and see it's "Tier 1." The verification prompt says "complete verification to unlock more opportunities." Immediate motivation.

### Document Uploads (Single Page, 3 Sections)

| Document | Type | Required | Notes |
|----------|------|----------|-------|
| Passport | file upload (JPG/PNG/PDF) | YES | Main info page, clear, color, all 4 corners |
| Profile Photograph | file upload (JPG/PNG) | YES | Headshot, no hats/sunglasses, face visible |
| WWCC Verification | file OR text input | YES | 3 options: Grant email PDF, Service NSW screenshot, or WWCC number |

**Post-submission**: AI processes documents → auto-verification or flagged for admin review → Tier 2 achieved → nanny notified.

---

## NANNY JOURNEY: Tier 3 (Facebook Verification)

**Trigger**: After Tier 2, nanny is prompted to share an AI-generated Facebook post.
**Purpose**: Viral growth + final verification tier.
**Flow**: AI generates Facebook post text → Nanny shares on Facebook → Nanny uploads screenshot → Admin/AI verifies → Tier 3 achieved → Nanny can now receive babysitting requests.

---

## PARENT JOURNEY: Nanny Request Form

### The Compliance Psychology

The parent form follows a different strategy: **urgency-first framing**. By asking "when do you need a nanny?" as the very first question, we:
1. Create emotional investment immediately (they NEED help)
2. Set the frame for the rest of the form (practical, solution-oriented)
3. Enable priority-based processing on the backend

### STEP 1: URGENCY & TIMELINE
**Psychology**: Urgency creates commitment. "I need help NOW" → they'll finish the form.
**Matching value**: Urgency affects processing priority and nanny notification timing.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Urgency | radio | YES | spec + OLD | "Immediately" or "At a later date" |
| Start Date | date picker | YES | spec + OLD | DD/MM/YYYY, cannot be in past |
| Placement Length | radio | YES | spec + OLD | "Ongoing" or "Until a certain date" |
| End Date (conditional) | date picker | conditional | spec + OLD | Only if "Until a certain date" selected. Must be after start date. |

---

### STEP 2: ABOUT YOUR FAMILY
**Psychology**: Personal but not invasive — parents like talking about their family.
**Matching value**: Number and ages of children are key matching inputs.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Reason for Nanny | select/radio | YES | OLD | Why do you need a nanny? |
| About Family | yes/no + textarea | NO | OLD | "Anything about your family you'd like to share?" |
| Number of Children | number (1-3) | YES | OLD + spec | Position form supports up to 3 |
| Child A - Age | number (months) | YES | OLD | Stored as months in DB (0-180+) |
| Child A - Gender | select | NO | OLD | Optional |
| Child B - Age (conditional) | number | conditional | OLD | Only if 2+ children |
| Child B - Gender (conditional) | select | conditional | OLD | |
| Child C - Age (conditional) | number | conditional | OLD | Only if 3 children |
| Child C - Gender (conditional) | select | conditional | OLD | |
| Child Needs | yes/no + textarea | NO | OLD | Special needs or requirements |

**Matching formula impact**: Child ages → age bracket matching with nanny experience. Child count → capacity gatekeeper.

---

### STEP 3: CARE REQUIREMENTS
**Psychology**: Defining what they need — still feels productive and hopeful.
**Matching value**: Level of support and schedule are key scoring factors.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Level of Support Required | select | YES | OLD | Supervision, Engagement, Educational, Developmental |
| Role & Responsibilities | multi-select | YES | OLD | What tasks should the nanny handle? |
| Schedule | radio | YES | OLD | Fixed / Flexible / TBD |
| Hours per Week | number | YES | OLD | Estimated weekly hours |
| Weekly Roster | grid | YES | OLD | Mon-Sun with time slots (mirrors nanny availability grid) |

**Matching formula impact**: Level of support → bonus scoring (up to 4 points). Schedule → coverage multiplier.

---

### STEP 4: NANNY PREFERENCES
**Psychology**: Choosing their ideal nanny. Empowering.
**Matching value**: These directly feed the matching algorithm filters and scoring.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Hourly Rate Maximum | select | YES | OLD + spec | $35, $40, $45, $50 — parent's max |
| Experience Level Preferred | select | NO | OLD + spec | Minimum years of experience |
| Age Preference (nanny) | range | NO | OLD | Minimum nanny age |
| Qualifications Required | multi-select | NO | OLD + spec | Cert III+, First Aid, etc. |
| Language Requirements | multi-select | NO | spec | Languages the nanny should speak |
| Driver's License Required | yes/no | NO | OLD | Gatekeeper in matching |
| Car Required | yes/no | NO | OLD | |
| Non-Smoker Required | yes/no | NO | OLD | |
| Pets at Home | yes/no | NO | OLD + spec | Nanny must be comfortable with pets |

**Matching formula impact**: Rate → 20 points max (highest single factor in base scoring). License/car → gatekeepers. Age preference → 0.8x penalty if nanny below.

---

### STEP 5: YOUR DETAILS & LOCATION
**Psychology**: Personal info last — they're committed by now.
**Matching value**: Location is the distance multiplier. Contact info enables coordination.

| Field | Type | Required | Source | Notes |
|-------|------|----------|--------|-------|
| Parent Name | text | YES | spec | May already have from signup |
| Email | email | YES | spec | May already have from signup |
| Phone | tel | YES | spec | For interview coordination |
| Suburb | text/select | YES | OLD | Used for distance calculation |
| Postcode | text | YES | OLD | Used for lat/lng lookup |
| Address | text | NO | OLD | Full address for babysitting |

**Matching formula impact**: Suburb/postcode → Haversine distance → location multiplier (under 5km: 1.0x, over 30km: 0.5x).

---

### STEP SUMMARY: PARENT REQUEST

| Step | Name | Fields | Time | Psychology |
|------|------|--------|------|-----------|
| 1 | Urgency & Timeline | 4 | 30s | Creates commitment |
| 2 | About Your Family | 10 | 2min | Personal, positive |
| 3 | Care Requirements | 5 | 2min | Defining needs |
| 4 | Nanny Preferences | 9 | 2min | Choosing ideal nanny |
| 5 | Your Details & Location | 6 | 1min | Contact + geography |
| **Total** | | **~34 fields** | **~8min** | |

---

## MATCHING ALGORITHM: What Feeds What

### Scoring Breakdown (max ~55 raw points → curved to 65-100%)

| Category | Max Points | Source Fields | Weight |
|----------|-----------|---------------|--------|
| Hourly Rate | 20 | nanny.hourly_rate_min vs parent.hourly_rate_max | 36% |
| Experience | 25 | nanny.total_experience_years vs parent.experience_required | 45% |
| Qualifications Bonus | 11 (×0.5) | nanny.qualifications + certifications | 10% |
| Support Level Bonus | 4 (×0.5) | nanny.level_of_support vs parent.level_of_support | 4% |
| Tenure Bonus | 5 (×0.5) | nanny.total_experience_years × 0.5 | 5% |

### Multipliers (applied after scoring)

| Multiplier | Range | Source Fields |
|------------|-------|---------------|
| Distance | 0.5x - 1.0x | nanny.suburb/postcode vs parent.suburb/postcode |
| Car Bonus | up to 1.5x | nanny.has_car (offsets distance) |
| Schedule Coverage | 0.1x - 1.0x | nanny.availability vs parent.weekly_roster |
| Schedule Flexibility | up to 1.5x | parent.schedule_flexible |
| Nanny Age | 0.8x penalty | nanny.date_of_birth vs parent.age_preference |
| Child Age Bracket | 0.1x per bracket | nanny.age_groups vs parent.child_ages |
| Capacity | 0.5x - 1.0x | nanny.max_children vs parent.number_of_children |

### Gatekeepers (Pass/Fail)

| Check | Fails If |
|-------|----------|
| Availability | Zero overlapping time slots |
| Driver's License | Parent requires, nanny doesn't have |
| Car | Parent requires, nanny doesn't have |
| Special Needs | Parent needs, nanny can't support |
| Capacity | Parent's children > nanny's max |

**Disqualified nannies are capped at 60% match score** but still shown as backfill.

---

## BABYSITTING REQUEST FLOW (Separate from Position Matching)

**Trigger**: Parent with active placement OR any Tier 3 parent can post one-time jobs.
**Different algorithm**: Proximity-based, not scored matching.

1. Parent posts babysitting request (date, time slots, suburb, rate, children details)
2. System finds all Tier 3 nannies available at requested time
3. Calculates distance using Haversine formula from nanny suburb to job suburb
4. Selects 20 closest nannies
5. Sends notifications to all 20 simultaneously
6. First nanny to accept wins (timestamp-based)

---

## COMPLETE USER LIFECYCLE

```
NANNY:
  Signup (email + password + role)
    → Registration Form (9 steps, ~58 fields)
      → AI Bio Generated (GPT-4o)
        → Profile Live (TIER 1: browsable, can receive interview requests)
          → Verification Form (passport + photo + WWCC)
            → AI Verification (document analysis)
              → TIER 2: visible in match-making, full interview access
                → Facebook Post (AI-generated, shared publicly)
                  → Screenshot Upload → Admin/AI Verify
                    → TIER 3: visible in babysitting requests

PARENT:
  Signup (email + password + role)
    → Browse Nannies (public, no form needed)
      → Create Position (5 steps, ~34 fields) [ONE active at a time]
        → See Matched Nannies (algorithm-ranked)
          → Request Interview (pick 3 time slots)
            → AI Emails Nanny → Nanny Accepts/Declines
              → Interview Happens
                → Hire → Placement Created
                  → Can Post Babysitting Requests (one-time jobs)
```

---

## GAPS & DECISIONS NEEDED

### Nanny Form — Fields in OLD System But NOT in Spec
These exist in the GAS scripts and affect matching, but the form spec analysis didn't capture them:
- Gender (collected in old form, not in spec)
- Under-3 experience years (critical for age bracket matching)
- Newborn experience years (critical for newborn matching)
- Role types preferred (Nanny, Babysitter, etc.)
- Level of support offered (Supervision → Developmental)
- Pay frequency (Daily, Weekly, etc.)
- Residency status (Citizen, PR, Visa)
- Right to work (legal requirement)
- Experience details (free text, fed to AI bio)

**Recommendation**: Include all of these. The OLD system collected them for good reason — they feed the matching algorithm.

### Parent Form — Steps 2-5 Are Estimated in Spec
The form spec only fully documents Step 1 (Urgency). Steps 2-5 were "inferred from business logic."
The OLD system GAS scripts show the actual fields collected.

**Recommendation**: Use the OLD system's actual fields (documented above) as the source of truth for Steps 2-5, validated against the live Wix form if possible.

### Field Relocations from Current App
The current app puts several fields in wrong steps compared to optimal compliance order:
- DOB, nationality → currently in Step 1 (Basics) → should move to Steps 7-8
- Driver's license, car → currently in Step 6 (About You) → should move to Step 5 (Location)
- All personal details → currently crammed into one "About You" step → should be split across Steps 7, 8, 9

### Missing Components Needed
- Weekly availability grid (interactive Mon-Sun × 4 time slots)
- File upload with preview (profile photo, verification documents)
- Nationality dropdown with search (200+ countries)
- Emergency contact fields
- Reference fields (name, phone, relationship)
- Accuracy confirmation checkbox
