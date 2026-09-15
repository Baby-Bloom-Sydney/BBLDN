> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# Baby Bloom Sydney - Final Database Schema v3.0

**Last Updated:** 2026-02-05
**Status:** ✅ FINAL - All Decisions Made - Ready for Implementation

---

## ALL DESIGN DECISIONS ✅

### Confirmed:
1. ✅ **Profile Pictures:** Single source in `user_profiles.profile_picture_url` (Cloudinary)
2. ✅ **Nanny Ad Images:** Separate `nanny_images` table (Cloudinary)
3. ✅ **One Position Rule:** Parents can only have ONE active position (unique constraint)
4. ✅ **WWCC Expiry:** Auto-disable from MM/BSR, hide "Request Interview" button
5. ✅ **Image Storage:** Cloudinary for all images
6. ✅ **Qualifications & Certifications:** MERGED into single `nanny_credentials` table
7. ✅ **Child Age Storage:** Store in months as INTEGER (0-180+ months)
8. ✅ **File Retention:** Keep for 5 years after nanny deactivation
9. ✅ **Unverified Nanny Visibility:**
   - ✅ Profile pages accessible (for their own viewing)
   - ✅ Hidden from Match Making queries
   - ✅ Hidden from Babysitting Request notifications
   - ✅ "Request Interview" button disabled/hidden

---

## TABLE STRUCTURE (24 TABLES)

### Core Identity (3 tables)
1. `users` - Supabase Auth extension
2. `user_profiles` - Common profile data
3. `user_roles` - Role management

### Nanny Profile (7 tables)
4. `nannies` - Main nanny entity (with current_placement_id)
5. `nanny_availability` - Weekly schedule (JSONB)
6. `nanny_credentials` - **MERGED** qualifications + certifications
7. `nanny_assurances` - Police check, references
8. `nanny_images` - Cloudinary images (profile + ads)
9. `nanny_ai_content` - AI-generated content
10. `verifications` - WWCC + identity verification

### Parent Profile (4 tables)
11. `parents` - Main parent entity (with current_nanny_id)
12. `nanny_positions` - Open position (ONE per parent)
13. `position_schedule` - Weekly schedule requirements
14. `position_children` - Children in position

### Matching & Requests (5 tables)
15. `interview_requests` - Interview coordination
16. `babysitting_requests` - One-time jobs
17. `bsr_time_slots` - BSR time slots
18. `bsr_notifications` - Who was notified
19. `nanny_placements` - **NEW** Hired nanny tracking

### Reference & Logs (5 tables)
20. `sydney_postcodes` - Suburb reference data
21. `user_progress` - Pipeline stage tracking
22. `activity_logs` - Complete audit trail
23. `email_logs` - All system emails
24. `file_retention_log` - Track file deletion after 5 years

---

## DETAILED SCHEMA

### 1. USER_ROLES (Supabase Auth Extension)

```sql
CREATE TABLE user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('nanny', 'parent', 'admin', 'super_admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_roles_role ON user_roles(role);
```

---

### 2. USER_PROFILES (Common Data - Single Source)

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Basic Info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL, -- Denormalized from auth.users
  mobile_number TEXT,
  date_of_birth DATE,

  -- Location (Required)
  suburb TEXT NOT NULL,
  postcode TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  state TEXT DEFAULT 'NSW',

  -- Profile Picture (SINGLE SOURCE - Cloudinary)
  profile_picture_url TEXT,
  profile_picture_cloudinary_id TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_suburb ON user_profiles(suburb);
CREATE INDEX idx_user_profiles_postcode ON user_profiles(postcode);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
```

---

### 3. NANNIES (Complete Entity)

```sql
CREATE TABLE nannies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Demographics
  gender TEXT CHECK (gender IN ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  nationality TEXT,
  languages TEXT[],

  -- Experience (ALL IN YEARS)
  total_experience_years INT,
  nanny_experience_years INT,
  under_3_experience_years INT,
  newborn_experience_years INT,
  experience_details TEXT,

  -- Preferences - What nanny wants to do
  role_types_preferred TEXT[],
  level_of_support_offered TEXT[],

  -- Work Preferences - Pay & Schedule
  hourly_rate_min DECIMAL(10,2),
  pay_frequency TEXT[],
  immediate_start_available BOOLEAN DEFAULT false,
  placement_ongoing_preferred BOOLEAN DEFAULT false,
  start_date_earliest DATE,
  end_date_latest DATE,

  -- Capabilities - Who they can work with
  max_children INT CHECK (max_children IN (1, 2, 3)),
  min_child_age_months INT,
  max_child_age_months INT,
  additional_needs_ok BOOLEAN DEFAULT false,

  -- Logistics
  sydney_resident BOOLEAN,
  residency_status TEXT CHECK (residency_status IN ('Australian Citizen', 'Permanent Resident', 'Working Holiday', 'Other')),
  right_to_work BOOLEAN,
  drivers_license BOOLEAN,
  has_car BOOLEAN,
  comfortable_with_pets BOOLEAN,
  vaccination_status BOOLEAN,
  non_smoker BOOLEAN,

  -- Personal - About You section
  hobbies_interests TEXT,
  strengths_traits TEXT,
  skills_training TEXT,

  -- Status & Verification
  status TEXT CHECK (status IN ('active', 'inactive', 'suspended', 'pending_verification', 'deactivated')) DEFAULT 'pending_verification',
  verification_tier TEXT CHECK (verification_tier IN ('tier1', 'tier2', 'tier3')) DEFAULT 'tier1',

  -- WWCC Status (drives MM/BSR visibility)
  wwcc_verified BOOLEAN DEFAULT false,
  wwcc_expiry_date DATE,
  identity_verified BOOLEAN DEFAULT false,

  -- Computed Verification Status
  fully_verified BOOLEAN GENERATED ALWAYS AS (wwcc_verified AND identity_verified) STORED,

  -- Computed Visibility Flags (CRITICAL for MM/BSR)
  visible_in_match_making BOOLEAN GENERATED ALWAYS AS (
    status = 'active' AND wwcc_verified AND identity_verified
  ) STORED,

  visible_in_bsr BOOLEAN GENERATED ALWAYS AS (
    status = 'active' AND wwcc_verified AND identity_verified
  ) STORED,

  -- Profile visibility (unverified nannies can view their profile but nothing else)
  profile_visible BOOLEAN GENERATED ALWAYS AS (
    status IN ('active', 'pending_verification')
  ) STORED,

  -- Deactivation tracking (for 5-year file retention)
  deactivated_at TIMESTAMPTZ,
  files_deleted_at TIMESTAMPTZ,

  -- Current Placement (Reference to active hire)
  current_placement_id UUID REFERENCES nanny_placements(id) ON DELETE SET NULL,

  -- Wix Integration
  wix_contact_id TEXT UNIQUE,
  wix_submission_id TEXT,
  wix_submission_link TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  tier2_achieved_at TIMESTAMPTZ,
  tier3_achieved_at TIMESTAMPTZ
);

CREATE INDEX idx_nannies_user_id ON nannies(user_id);
CREATE INDEX idx_nannies_status ON nannies(status);
CREATE INDEX idx_nannies_tier ON nannies(verification_tier);
CREATE INDEX idx_nannies_visible_mm ON nannies(visible_in_match_making) WHERE visible_in_match_making = true;
CREATE INDEX idx_nannies_visible_bsr ON nannies(visible_in_bsr) WHERE visible_in_bsr = true;
CREATE INDEX idx_nannies_profile_visible ON nannies(profile_visible) WHERE profile_visible = true;
CREATE INDEX idx_nannies_wix_contact ON nannies(wix_contact_id);
CREATE INDEX idx_nannies_hourly_rate ON nannies(hourly_rate_min);
CREATE INDEX idx_nannies_wwcc_expiry ON nannies(wwcc_expiry_date) WHERE wwcc_verified = true;
CREATE INDEX idx_nannies_deactivated ON nannies(deactivated_at) WHERE deactivated_at IS NOT NULL AND files_deleted_at IS NULL;
CREATE INDEX idx_nannies_current_placement ON nannies(current_placement_id) WHERE current_placement_id IS NOT NULL;
```

**Key Features:**
- ✅ `profile_visible` - Unverified nannies can see their own profile
- ✅ `visible_in_match_making` - Only verified, active nannies
- ✅ `visible_in_bsr` - Only verified, active nannies
- ✅ `deactivated_at` + `files_deleted_at` - Track 5-year retention

---

### 4. NANNY_AVAILABILITY

```sql
CREATE TABLE nanny_availability (
  nanny_id UUID PRIMARY KEY REFERENCES nannies(id) ON DELETE CASCADE,

  -- Days available (denormalized)
  days_available TEXT[],

  -- Detailed schedule grid
  schedule JSONB NOT NULL,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nanny_availability_schedule ON nanny_availability USING GIN (schedule);
CREATE INDEX idx_nanny_availability_days ON nanny_availability USING GIN (days_available);
```

---

### 5. NANNY_CREDENTIALS (MERGED - Qualifications + Certifications)

```sql
CREATE TABLE nanny_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nanny_id UUID REFERENCES nannies(id) ON DELETE CASCADE,

  -- Credential Type
  credential_category TEXT NOT NULL CHECK (credential_category IN ('qualification', 'certification')),

  -- QUALIFICATIONS (Permanent Education)
  qualification_type TEXT CHECK (qualification_type IN (
    'Certificate III in Early Childhood Education and Care',
    'Certificate IV in Education Support',
    'Diploma of Early Childhood Education and Care',
    'Bachelor of Early Childhood Education (Or Equivalent)',
    'No Qualifications',
    'Other'
  )),

  -- Optional details
  institution TEXT,
  year_obtained INT,

  -- CERTIFICATIONS (Time-Limited)
  certification_type TEXT CHECK (certification_type IN (
    'CPR',
    'First Aid',
    'First Aid in Education & Care Setting',
    'Child Protection',
    'Anaphylaxis and Asthma Management'
  )),

  -- File upload (Supabase Storage)
  file_url TEXT,
  file_name TEXT,
  issue_date DATE,
  expiry_date DATE,

  -- VERIFICATION (Admin Review)
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_qualification CHECK (
    (credential_category = 'qualification' AND qualification_type IS NOT NULL) OR
    (credential_category = 'certification' AND certification_type IS NOT NULL)
  ),

  CONSTRAINT valid_certification_dates CHECK (
    credential_category = 'qualification' OR
    (credential_category = 'certification' AND issue_date IS NOT NULL AND expiry_date IS NOT NULL)
  )
);

CREATE INDEX idx_nanny_credentials_nanny_id ON nanny_credentials(nanny_id);
CREATE INDEX idx_nanny_credentials_category ON nanny_credentials(credential_category);
CREATE INDEX idx_nanny_credentials_qual_type ON nanny_credentials(qualification_type);
CREATE INDEX idx_nanny_credentials_cert_type ON nanny_credentials(certification_type);
CREATE INDEX idx_nanny_credentials_expiry ON nanny_credentials(expiry_date) WHERE credential_category = 'certification';
CREATE INDEX idx_nanny_credentials_verified ON nanny_credentials(verified);
```

---

### 6. NANNY_ASSURANCES (Police Check, References)

```sql
CREATE TABLE nanny_assurances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nanny_id UUID REFERENCES nannies(id) ON DELETE CASCADE,

  assurance_type TEXT NOT NULL CHECK (assurance_type IN (
    'National Police Check',
    'References',
    'Professional References'
  )),

  file_url TEXT,
  file_name TEXT,
  issue_date DATE,
  expiry_date DATE,
  reference_details TEXT,

  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nanny_assurances_nanny_id ON nanny_assurances(nanny_id);
CREATE INDEX idx_nanny_assurances_type ON nanny_assurances(assurance_type);
```

---

### 7. NANNY_IMAGES (Cloudinary)

```sql
CREATE TABLE nanny_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nanny_id UUID REFERENCES nannies(id) ON DELETE CASCADE,

  image_type TEXT NOT NULL CHECK (image_type IN ('ad_primary', 'ad_secondary', 'ad_gallery')),

  cloudinary_url TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  cloudinary_format TEXT,
  cloudinary_width INT,
  cloudinary_height INT,

  is_primary BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0,
  alt_text TEXT,

  approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nanny_images_nanny_id ON nanny_images(nanny_id);
CREATE INDEX idx_nanny_images_type ON nanny_images(image_type);
CREATE INDEX idx_nanny_images_approved ON nanny_images(approved) WHERE image_type LIKE 'ad_%';

CREATE UNIQUE INDEX idx_nanny_images_one_primary
  ON nanny_images(nanny_id, is_primary)
  WHERE is_primary = true;
```

---

### 8. VERIFICATIONS (WWCC + Identity)

```sql
CREATE TABLE verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- WWCC VERIFICATION
  wwcc_verification_method TEXT CHECK (wwcc_verification_method IN ('grant_email', 'service_nsw_app', 'manual_entry')),
  wwcc_grant_email_url TEXT,
  wwcc_service_nsw_screenshot_url TEXT,
  wwcc_number TEXT,
  wwcc_declaration BOOLEAN DEFAULT false,

  wwcc_verified BOOLEAN DEFAULT false,
  wwcc_verified_at TIMESTAMPTZ,
  wwcc_verified_by UUID REFERENCES auth.users(id),
  wwcc_expiry_date DATE,
  wwcc_rejection_reason TEXT,

  -- IDENTITY VERIFICATION
  surname TEXT,
  given_names TEXT,
  date_of_birth DATE,
  passport_country TEXT,
  passport_upload_url TEXT,
  identification_photo_url TEXT,
  passport_declaration BOOLEAN DEFAULT false,

  identity_verified BOOLEAN DEFAULT false,
  identity_verified_at TIMESTAMPTZ,
  identity_verified_by UUID REFERENCES auth.users(id),
  passport_expiry_date DATE,
  identity_rejection_reason TEXT,

  -- OVERALL STATUS (integer-based, see verification_pipeline constants)
  -- 0=Not Started, 10-12=ID stage, 20-28=WWCC stage, 30=Provisional, 40=Fully Verified
  verification_status INTEGER DEFAULT 0,

  -- PER-SECTION STATUSES (string-based, drive UI)
  identity_status TEXT DEFAULT 'not_started',
  wwcc_status TEXT DEFAULT 'not_started',
  contact_status TEXT DEFAULT 'not_started',
  cross_check_status TEXT DEFAULT 'not_started',
  identity_status_at TIMESTAMPTZ,
  wwcc_status_at TIMESTAMPTZ,

  -- AI VERIFICATION DATA
  wwcc_doc_verified BOOLEAN DEFAULT false,
  wwcc_doc_verified_at TIMESTAMPTZ,
  wwcc_ai_reasoning TEXT,
  wwcc_ai_issues JSONB,
  wwcc_user_guidance JSONB,       -- UserGuidance object for nanny-facing messages
  identity_ai_reasoning TEXT,
  identity_ai_issues JSONB,
  identity_user_guidance JSONB,
  extracted_surname TEXT,
  extracted_given_names TEXT,
  extracted_dob TEXT,
  extracted_nationality TEXT,
  extracted_passport_number TEXT,
  extracted_passport_expiry TEXT,
  extracted_wwcc_surname TEXT,
  extracted_wwcc_first_name TEXT,
  extracted_wwcc_other_names TEXT,
  extracted_wwcc_number TEXT,
  extracted_wwcc_clearance_type TEXT,
  extracted_wwcc_expiry TEXT,

  -- CROSS-CHECK
  cross_check_reasoning TEXT,
  cross_check_issues JSONB,
  cross_check_at TIMESTAMPTZ,

  -- OCG AUDIT DATA (Office of the Children's Guardian — AUTHORITATIVE source)
  -- These columns record the EXACT data from OCG verification emails.
  -- OCG CLEARED is the ONLY path to FULLY_VERIFIED (status 40).
  ocg_employer_id TEXT,            -- OCG employer account ID
  ocg_employer_name TEXT,          -- Employer name registered with OCG
  ocg_verified_at TIMESTAMPTZ,    -- When OCG performed the check
  ocg_result_status TEXT,          -- CLEARED / NOT FOUND / BARRED / INTERIM BAR / EXPIRED / CLOSED / APPLICATION IN PROGRESS
  ocg_result_text TEXT,            -- Full OCG result description verbatim
  ocg_expiry_date DATE,            -- WWCC expiry as confirmed by OCG (authoritative)
  ocg_reference_number TEXT,       -- WWCC number confirmed by OCG
  ocg_google_message_id TEXT,      -- Google Message-ID of the OCG notification email
  ocg_recorded_at TIMESTAMPTZ,    -- When we recorded this OCG data

  -- CONTACT DETAILS
  phone_number TEXT,
  address_line TEXT,
  city TEXT,
  state TEXT,
  postcode TEXT,
  country TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- OCG authority constraint: FULLY_VERIFIED requires OCG CLEARED
  CONSTRAINT chk_fully_verified_requires_ocg_cleared CHECK (
    verification_status != 40 OR ocg_result_status = 'CLEARED' OR ocg_result_status IS NULL
  ),

  CONSTRAINT valid_wwcc_method CHECK (
    wwcc_verification_method IS NULL OR
    (wwcc_verification_method = 'grant_email' AND wwcc_grant_email_url IS NOT NULL) OR
    (wwcc_verification_method = 'service_nsw_app' AND wwcc_service_nsw_screenshot_url IS NOT NULL) OR
    (wwcc_verification_method = 'manual_entry' AND wwcc_number IS NOT NULL)
  )
);

-- Trigger: sync nanny record when OCG result is set (see migration SQL)
-- Trigger: trg_sync_nanny_from_ocg → sync_nanny_from_ocg_result()

CREATE INDEX idx_verifications_user ON verifications(user_id);
CREATE INDEX idx_verifications_wwcc_verified ON verifications(wwcc_verified);
CREATE INDEX idx_verifications_identity_verified ON verifications(identity_verified);
CREATE INDEX idx_verifications_status ON verifications(verification_status);
CREATE INDEX idx_verifications_wwcc_expiry ON verifications(wwcc_expiry_date) WHERE wwcc_verified = true;
```

**Verification Status Codes (integer):**

| Code | Name | Description |
|------|------|-------------|
| 0 | NOT_STARTED | No verification attempted |
| 10 | PENDING_ID_AUTO | Identity AI check in progress |
| 11 | PENDING_ID_REVIEW | Identity needs manual review |
| 12 | ID_REJECTED | Identity verification failed |
| 20 | PENDING_WWCC_AUTO | WWCC AI check in progress |
| 21 | PENDING_WWCC_REVIEW | WWCC needs manual/admin review |
| 22 | WWCC_REJECTED | WWCC rejected (or BARRED by OCG) |
| 23 | WWCC_EXPIRED | WWCC expired (OCG or auto-detected) |
| 24 | WWCC_DOCUMENT_FAILED | WWCC document parsing failed |
| 25 | WWCC_PROCESSING | WWCC AI processing |
| 26 | WWCC_OCG_NOT_FOUND | OCG has no record of this WWCC |
| 27 | WWCC_CLOSED | OCG says WWCC application was closed |
| 28 | WWCC_APPLICATION_PENDING | OCG says application still in progress |
| 30 | PROVISIONALLY_VERIFIED | AI checks passed, awaiting OCG |
| 40 | FULLY_VERIFIED | OCG CLEARED (only path here) |

**WWCC Status Values (string):**
`not_started`, `pending`, `processing`, `doc_verified`, `review`, `rejected`, `failed`, `expired`, `ocg_not_found`, `closed`, `application_pending`, `barred`

---

### 9. PARENTS

```sql
CREATE TABLE parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  wix_contact_id TEXT UNIQUE,
  wix_submission_id TEXT,
  wix_submission_link TEXT,

  number_of_children INT CHECK (number_of_children IN (1, 2, 3)),
  child_needs BOOLEAN DEFAULT false,
  child_needs_details TEXT,
  about_family TEXT,

  current_nanny_id UUID REFERENCES nannies(id) ON DELETE SET NULL,
  current_placement_id UUID REFERENCES nanny_placements(id) ON DELETE SET NULL,

  status TEXT CHECK (status IN ('active', 'inactive', 'paused')) DEFAULT 'active',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parents_user_id ON parents(user_id);
CREATE INDEX idx_parents_status ON parents(status);
CREATE INDEX idx_parents_wix_contact ON parents(wix_contact_id);
CREATE INDEX idx_parents_current_nanny ON parents(current_nanny_id) WHERE current_nanny_id IS NOT NULL;
CREATE INDEX idx_parents_current_placement ON parents(current_placement_id) WHERE current_placement_id IS NOT NULL;
```

---

### 10. NANNY_POSITIONS (ONE Active per Parent)

```sql
CREATE TABLE nanny_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES parents(id) ON DELETE CASCADE,

  title TEXT DEFAULT 'Nanny Position',
  description TEXT,

  -- TIMELINE
  urgency TEXT CHECK (urgency IN ('Immediately', 'At a later date')),
  start_date DATE,
  placement_length TEXT CHECK (placement_length IN ('Ongoing', 'Until a certain date')),
  end_date DATE,

  -- SCHEDULE
  schedule_type TEXT CHECK (schedule_type IN ('Yes', 'No', 'I''m Flexible')),
  hours_per_week INT,
  days_required TEXT[],
  schedule_details TEXT,

  -- NANNY REQUIREMENTS
  language_preference TEXT CHECK (language_preference IN ('English', 'Foreign language', 'Multiple')),
  language_preference_details TEXT,
  minimum_age_requirement INT CHECK (minimum_age_requirement IN (18, 21, 25, 28, 35)),
  years_of_experience INT CHECK (years_of_experience IN (1, 2, 3, 5)),
  qualification_requirement TEXT,
  certificate_requirements TEXT[],
  assurances_required TEXT[],
  residency_status_requirement TEXT CHECK (residency_status_requirement IN ('Permanent Resident', 'Any Status')),

  -- BOOLEANS
  vaccination_required BOOLEAN,
  drivers_license_required BOOLEAN,
  car_required BOOLEAN,
  comfortable_with_pets_required BOOLEAN,
  non_smoker_required BOOLEAN,
  other_requirements_exist BOOLEAN DEFAULT false,
  other_requirements_details TEXT,

  -- COMPENSATION
  hourly_rate DECIMAL(10,2),
  pay_frequency TEXT[],

  -- REASON & SUPPORT
  reason_for_nanny TEXT[],
  level_of_support TEXT[],

  -- STATUS
  status TEXT CHECK (status IN ('draft', 'active', 'paused', 'filled', 'cancelled')) DEFAULT 'active',
  filled_at TIMESTAMPTZ,
  filled_by_nanny_id UUID REFERENCES nannies(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_nanny_positions_parent ON nanny_positions(parent_id);
CREATE INDEX idx_nanny_positions_status ON nanny_positions(status);
CREATE INDEX idx_nanny_positions_active ON nanny_positions(status) WHERE status = 'active';
CREATE INDEX idx_nanny_positions_start_date ON nanny_positions(start_date);
CREATE INDEX idx_nanny_positions_hourly_rate ON nanny_positions(hourly_rate);
CREATE INDEX idx_nanny_positions_days ON nanny_positions USING GIN (days_required);

-- CRITICAL: Only ONE active position per parent
CREATE UNIQUE INDEX idx_nanny_positions_one_active_per_parent
  ON nanny_positions(parent_id)
  WHERE status = 'active';
```

---

### 11. POSITION_SCHEDULE

```sql
CREATE TABLE position_schedule (
  position_id UUID PRIMARY KEY REFERENCES nanny_positions(id) ON DELETE CASCADE,
  schedule JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_position_schedule_jsonb ON position_schedule USING GIN (schedule);
```

---

### 12. POSITION_CHILDREN (Ages in Months)

```sql
CREATE TABLE position_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID REFERENCES nanny_positions(id) ON DELETE CASCADE,

  child_label TEXT NOT NULL CHECK (child_label IN ('A', 'B', 'C')),
  age_months INT NOT NULL,
  gender TEXT CHECK (gender IN ('Female', 'Male', 'Rather Not Say')),
  display_order INT NOT NULL CHECK (display_order IN (1, 2, 3)),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_position_children_position ON position_children(position_id);
CREATE INDEX idx_position_children_age ON position_children(age_months);
CREATE UNIQUE INDEX idx_position_children_unique ON position_children(position_id, child_label);
CREATE UNIQUE INDEX idx_position_children_order ON position_children(position_id, display_order);
```

---

### 13. NANNY_PLACEMENTS (Hired Nanny Tracking)

```sql
CREATE TABLE nanny_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nanny_id UUID NOT NULL REFERENCES nannies(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  position_id UUID REFERENCES nanny_positions(id) ON DELETE SET NULL,

  source TEXT NOT NULL CHECK (source IN (
    'interview_request',
    'babysitting_job',
    'direct_hire',
    'referral'
  )),
  interview_request_id UUID REFERENCES interview_requests(id) ON DELETE SET NULL,
  babysitting_request_id UUID REFERENCES babysitting_requests(id) ON DELETE SET NULL,

  hired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  start_date DATE,

  status TEXT NOT NULL CHECK (status IN (
    'active',
    'ended',
    'paused'
  )) DEFAULT 'active',

  ended_at TIMESTAMPTZ,
  end_reason TEXT CHECK (end_reason IN (
    'parent_no_longer_needs',
    'nanny_left',
    'mutual_agreement',
    'relocation',
    'child_aged_out',
    'other'
  )),
  end_notes TEXT,

  placement_duration_days INT GENERATED ALWAYS AS (
    EXTRACT(DAY FROM COALESCE(ended_at, NOW()) - hired_at)
  ) STORED,

  parent_satisfaction_rating INT CHECK (parent_satisfaction_rating BETWEEN 1 AND 5),
  nanny_satisfaction_rating INT CHECK (nanny_satisfaction_rating BETWEEN 1 AND 5),
  would_rehire BOOLEAN,
  would_work_again BOOLEAN,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_placements_nanny ON nanny_placements(nanny_id);
CREATE INDEX idx_placements_parent ON nanny_placements(parent_id);
CREATE INDEX idx_placements_status ON nanny_placements(status);
CREATE INDEX idx_placements_source ON nanny_placements(source);
CREATE INDEX idx_placements_hired_date ON nanny_placements(hired_at);

CREATE UNIQUE INDEX idx_placements_one_active_per_parent
  ON nanny_placements(parent_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX idx_placements_unique_active
  ON nanny_placements(nanny_id, parent_id)
  WHERE status = 'active';
```

---

### 14. FILE_RETENTION_LOG

```sql
CREATE TABLE file_retention_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nanny_id UUID REFERENCES nannies(id),

  file_type TEXT NOT NULL CHECK (file_type IN (
    'wwcc_document',
    'passport_document',
    'identification_photo',
    'police_check',
    'certification',
    'reference',
    'profile_picture',
    'ad_image'
  )),

  file_url TEXT NOT NULL,
  file_storage_provider TEXT CHECK (file_storage_provider IN ('supabase', 'cloudinary')),
  cloudinary_public_id TEXT,

  created_at TIMESTAMPTZ NOT NULL,
  nanny_deactivated_at TIMESTAMPTZ,
  scheduled_deletion_date DATE,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),

  reason_for_deletion TEXT CHECK (reason_for_deletion IN ('retention_expired', 'manual_deletion', 'gdpr_request'))
);

CREATE INDEX idx_file_retention_nanny ON file_retention_log(nanny_id);
CREATE INDEX idx_file_retention_scheduled ON file_retention_log(scheduled_deletion_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_file_retention_deleted ON file_retention_log(deleted_at);
```

---

### 15. ACTIVITY_LOGS

```sql
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  action_type TEXT NOT NULL CHECK (action_type IN (
    'signup', 'login', 'profile_updated', 'profile_deactivated',
    'nanny_profile_created', 'nanny_verification_submitted', 'nanny_tier_upgraded',
    'nanny_availability_updated', 'wwcc_expired', 'wwcc_renewed',
    'parent_profile_created', 'position_created', 'position_updated', 'position_closed',
    'babysitting_request_created', 'babysitting_request_cancelled',
    'interview_requested', 'interview_accepted', 'interview_declined', 'interview_completed',
    'placement_created', 'placement_ended', 'placement_paused', 'placement_resumed',
    'admin_override', 'verification_approved', 'verification_rejected',
    'user_suspended', 'user_reinstated',
    'email_sent', 'notification_sent', 'file_deleted'
  )),

  action_details JSONB,
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_action_type ON activity_logs(action_type);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX idx_activity_logs_details ON activity_logs USING GIN (action_details);
```

---

### 16. EMAIL_LOGS

```sql
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,

  email_type TEXT NOT NULL CHECK (email_type IN (
    'welcome', 'verification_pending', 'verification_approved', 'verification_rejected',
    'interview_request', 'interview_confirmed', 'interview_reminder',
    'babysitting_notification', 'babysitting_accepted', 'babysitting_cancelled',
    'position_matched', 'wwcc_expiring_soon', 'wwcc_expired',
    'placement_created', 'placement_ended', 'admin_notification'
  )),

  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,

  status TEXT CHECK (status IN ('queued', 'sent', 'failed', 'bounced')) DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  provider_message_id TEXT,
  provider_response JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_logs_recipient_user ON email_logs(recipient_user_id);
CREATE INDEX idx_email_logs_recipient_email ON email_logs(recipient_email);
CREATE INDEX idx_email_logs_type ON email_logs(email_type);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_created ON email_logs(created_at);
```

---

### 17. USER_PROGRESS (Funnel Tracking)

```sql
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  stage TEXT NOT NULL CHECK (stage IN (
    'nanny_signup', 'nanny_profile_created', 'nanny_verification_started',
    'nanny_tier2_achieved', 'nanny_tier3_achieved',
    'nanny_first_interview_received', 'nanny_first_babysitting_received', 'nanny_first_hire',
    'parent_signup', 'parent_browsing', 'parent_position_created',
    'parent_first_interview_requested', 'parent_first_babysitting_posted', 'parent_first_hire'
  )),

  reached_at TIMESTAMPTZ DEFAULT NOW(),
  stage_data JSONB
);

CREATE INDEX idx_user_progress_user ON user_progress(user_id);
CREATE INDEX idx_user_progress_stage ON user_progress(stage);
CREATE INDEX idx_user_progress_reached ON user_progress(reached_at);
CREATE UNIQUE INDEX idx_user_progress_unique ON user_progress(user_id, stage);
```

### 18. FORM_SNAPSHOTS (Audit Trail)

Saves the full raw form data on every submission/edit. Provides complete version history and a safety net if schema evolves.

```sql
CREATE TABLE form_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  form_type TEXT NOT NULL CHECK (form_type IN (
    'nanny_registration', 'nanny_edit', 'parent_position', 'verification'
  )),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_form_snapshots_user ON form_snapshots(user_id, form_type);
```

**Key Features:**
- Every form submission saves a timestamped JSONB snapshot
- Multiple snapshots per user (one per submission/edit)
- RLS: users can only view/insert their own snapshots

---

## AUTOMATED PROCESSES

### 1. WWCC Expiry Check (Daily Cron)

```sql
CREATE OR REPLACE FUNCTION check_wwcc_expiry()
RETURNS void AS $$
BEGIN
  UPDATE nannies
  SET wwcc_verified = false, updated_at = NOW()
  WHERE wwcc_verified = true AND wwcc_expiry_date <= CURRENT_DATE;

  INSERT INTO activity_logs (user_id, action_type, action_details, created_at)
  SELECT user_id, 'wwcc_expired', jsonb_build_object('expiry_date', wwcc_expiry_date), NOW()
  FROM nannies
  WHERE wwcc_verified = false AND wwcc_expiry_date = CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;
```

### 2. File Retention Cleanup (Daily Cron)

```sql
CREATE OR REPLACE FUNCTION cleanup_expired_files()
RETURNS void AS $$
DECLARE
  file_record RECORD;
BEGIN
  FOR file_record IN
    SELECT * FROM file_retention_log
    WHERE scheduled_deletion_date <= CURRENT_DATE AND deleted_at IS NULL
  LOOP
    UPDATE file_retention_log
    SET deleted_at = NOW(), deleted_by = NULL, reason_for_deletion = 'retention_expired'
    WHERE id = file_record.id;

    INSERT INTO activity_logs (user_id, action_type, action_details, created_at)
    VALUES (
      (SELECT user_id FROM nannies WHERE id = file_record.nanny_id),
      'file_deleted',
      jsonb_build_object('file_type', file_record.file_type, 'reason', 'retention_expired'),
      NOW()
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

---

## STORAGE ESTIMATES

### Database (1K nannies, 500 parents):
- Core tables: ~15 MB
- Indexes: ~10 MB
- JSONB data: ~5 MB
- **Total: ~30 MB**

### Supabase Storage:

**Bucket: `profile-pictures` (public)**
- Profile pictures: 1,500 × 200 KB = 300 MB

**Bucket: `verification-documents` (private)**
- WWCC docs: 1,000 × 2 MB = 2 GB
- Passport scans: 1,000 × 2 MB = 2 GB
- Certifications: 3,000 × 1 MB = 3 GB
- **Total: ~7.3 GB**

**Grand Total: 30 MB (DB) + 7.3 GB (Supabase Storage) = ~7.3 GB**

---

## FINAL STATUS

✅ **All Design Decisions Made**
✅ **Schema Finalized (25 Tables)**
✅ **Merged Qualifications + Certifications**
✅ **Child Ages in Months**
✅ **5-Year File Retention**
✅ **Unverified Nanny Visibility Rules**

**Ready for Implementation!** 🚀
