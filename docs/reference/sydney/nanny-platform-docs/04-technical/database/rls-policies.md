> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# Row Level Security (RLS) Policies

**Version:** 1.0
**Last Updated:** 2026-02-05
**Status:** 📋 Ready for Implementation

---

## Overview

This document defines Row Level Security (RLS) policies for all 24 tables in the Baby Bloom Sydney database. RLS ensures users can only access data they're authorized to see, enforced at the database level.

### Why RLS?

- **Defense in Depth:** Security enforced at database level, not just API
- **Zero Trust:** Even if API is bypassed, data remains protected
- **Supabase Native:** Integrates seamlessly with Supabase Auth
- **Audit Ready:** Compliance with data protection requirements

---

## Role Definitions

### 1. Public (Unauthenticated)
- No access to any data
- Must authenticate to access platform

### 2. Nanny
- Full access to own profile and related data
- Read access to verified nanny profiles (for reference)
- Read access to babysitting requests they're notified about
- No access to parent data (except via approved requests)

### 3. Parent
- Full access to own profile and positions
- Read access to verified nanny profiles for matching
- Full access to own interview/babysitting requests
- No access to other parent data

### 4. Admin
- Full read access to all data
- Write access to verification and status fields
- Cannot modify user personal data directly
- All actions logged

### 5. Super Admin
- Full access to everything
- Can modify system settings
- Can delete/restore users

---

## Policy Implementation Pattern

Each policy follows this pattern:

```sql
-- Enable RLS on table
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner (recommended)
ALTER TABLE table_name FORCE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "policy_name" ON table_name
  FOR [SELECT|INSERT|UPDATE|DELETE|ALL]
  TO [authenticated|anon|role_name]
  USING (condition)
  WITH CHECK (condition);
```

---

## Helper Functions

Before implementing policies, create these helper functions:

```sql
-- ============================================================================
-- RLS HELPER FUNCTIONS
-- ============================================================================

-- Get current user's role
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role FROM user_roles
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is a nanny
CREATE OR REPLACE FUNCTION auth.is_nanny()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.user_role() = 'nanny';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is a parent
CREATE OR REPLACE FUNCTION auth.is_parent()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.user_role() = 'parent';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is admin or super_admin
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.user_role() IN ('admin', 'super_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is super_admin
CREATE OR REPLACE FUNCTION auth.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.user_role() = 'super_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get nanny_id for current user
CREATE OR REPLACE FUNCTION auth.nanny_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id FROM nannies
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get parent_id for current user
CREATE OR REPLACE FUNCTION auth.parent_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id FROM parents
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Policies by Table

### 1. user_roles

```sql
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;

-- Users can read their own role
CREATE POLICY "Users can read own role"
  ON user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only super_admin can modify roles
CREATE POLICY "Super admin can manage roles"
  ON user_roles FOR ALL
  TO authenticated
  USING (auth.is_super_admin())
  WITH CHECK (auth.is_super_admin());

-- Service role for initial signup (handled by trigger)
```

---

### 2. user_profiles

```sql
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles FORCE ROW LEVEL SECURITY;

-- Users can read and update own profile
CREATE POLICY "Users can read own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can insert their own profile (during signup)
CREATE POLICY "Users can create own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Parents can read nanny profiles (for matching)
-- Nannies can read parent profiles (for interview requests)
CREATE POLICY "Parents can read verified nanny profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    auth.is_parent() AND
    EXISTS (
      SELECT 1 FROM nannies n
      WHERE n.user_id = user_profiles.user_id
      AND n.visible_in_match_making = true
    )
  );

CREATE POLICY "Nannies can read requesting parents"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    auth.is_nanny() AND
    EXISTS (
      SELECT 1 FROM interview_requests ir
      JOIN parents p ON ir.parent_id = p.id
      WHERE p.user_id = user_profiles.user_id
      AND ir.nanny_id = auth.nanny_id()
    )
  );

-- Admin full read access
CREATE POLICY "Admin read all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.is_admin());
```

---

### 3. sydney_postcodes

```sql
ALTER TABLE sydney_postcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sydney_postcodes FORCE ROW LEVEL SECURITY;

-- Public read access (reference data)
CREATE POLICY "Anyone can read postcodes"
  ON sydney_postcodes FOR SELECT
  TO authenticated
  USING (true);

-- Only super_admin can modify
CREATE POLICY "Super admin manages postcodes"
  ON sydney_postcodes FOR ALL
  TO authenticated
  USING (auth.is_super_admin())
  WITH CHECK (auth.is_super_admin());
```

---

### 4. verifications

```sql
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications FORCE ROW LEVEL SECURITY;

-- Nannies can read and create own verifications
CREATE POLICY "Nannies read own verifications"
  ON verifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND auth.is_nanny());

CREATE POLICY "Nannies create own verifications"
  ON verifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND auth.is_nanny());

CREATE POLICY "Nannies update own verifications"
  ON verifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND auth.is_nanny())
  WITH CHECK (
    user_id = auth.uid() AND
    auth.is_nanny() AND
    -- Cannot self-verify
    NEW.wwcc_verified = OLD.wwcc_verified AND
    NEW.identity_verified = OLD.identity_verified AND
    NEW.verification_status = OLD.verification_status
  );

-- Admin can read and update verifications
CREATE POLICY "Admin read all verifications"
  ON verifications FOR SELECT
  TO authenticated
  USING (auth.is_admin());

CREATE POLICY "Admin update verifications"
  ON verifications FOR UPDATE
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 5. activity_logs

```sql
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs FORCE ROW LEVEL SECURITY;

-- Users can read own activity logs
CREATE POLICY "Users read own logs"
  ON activity_logs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Insert is handled by system (service role)
CREATE POLICY "System can insert logs"
  ON activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin full read access
CREATE POLICY "Admin read all logs"
  ON activity_logs FOR SELECT
  TO authenticated
  USING (auth.is_admin());

-- No updates or deletes allowed
```

---

### 6. email_logs

```sql
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs FORCE ROW LEVEL SECURITY;

-- Users can read their own email logs
CREATE POLICY "Users read own email logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- System inserts (service role) - no user insert policy

-- Admin full read access
CREATE POLICY "Admin read all email logs"
  ON email_logs FOR SELECT
  TO authenticated
  USING (auth.is_admin());

-- Admin can update status
CREATE POLICY "Admin update email status"
  ON email_logs FOR UPDATE
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 7. user_progress

```sql
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress FORCE ROW LEVEL SECURITY;

-- Users can read own progress
CREATE POLICY "Users read own progress"
  ON user_progress FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- System inserts progress (service role handles)

-- Admin full access for analytics
CREATE POLICY "Admin read all progress"
  ON user_progress FOR SELECT
  TO authenticated
  USING (auth.is_admin());
```

---

### 8. nannies

```sql
ALTER TABLE nannies ENABLE ROW LEVEL SECURITY;
ALTER TABLE nannies FORCE ROW LEVEL SECURITY;

-- Nannies can read and update own record
CREATE POLICY "Nannies read own record"
  ON nannies FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND auth.is_nanny());

CREATE POLICY "Nannies update own record"
  ON nannies FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND auth.is_nanny())
  WITH CHECK (
    user_id = auth.uid() AND
    -- Cannot self-modify verification fields
    NEW.wwcc_verified = OLD.wwcc_verified AND
    NEW.identity_verified = OLD.identity_verified AND
    NEW.verification_tier = OLD.verification_tier AND
    NEW.status = OLD.status
  );

CREATE POLICY "Nannies create own record"
  ON nannies FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND auth.is_nanny());

-- Parents can read verified nannies for matching
CREATE POLICY "Parents read verified nannies"
  ON nannies FOR SELECT
  TO authenticated
  USING (
    auth.is_parent() AND
    visible_in_match_making = true
  );

-- Nannies can read other verified nannies (for reference)
CREATE POLICY "Nannies read verified peers"
  ON nannies FOR SELECT
  TO authenticated
  USING (
    auth.is_nanny() AND
    visible_in_match_making = true AND
    id != auth.nanny_id()
  );

-- Admin full access
CREATE POLICY "Admin read all nannies"
  ON nannies FOR SELECT
  TO authenticated
  USING (auth.is_admin());

CREATE POLICY "Admin update nannies"
  ON nannies FOR UPDATE
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 9. nanny_availability

```sql
ALTER TABLE nanny_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE nanny_availability FORCE ROW LEVEL SECURITY;

-- Nannies can manage own availability
CREATE POLICY "Nannies manage own availability"
  ON nanny_availability FOR ALL
  TO authenticated
  USING (nanny_id = auth.nanny_id())
  WITH CHECK (nanny_id = auth.nanny_id());

-- Parents can read verified nanny availability
CREATE POLICY "Parents read verified nanny availability"
  ON nanny_availability FOR SELECT
  TO authenticated
  USING (
    auth.is_parent() AND
    EXISTS (
      SELECT 1 FROM nannies n
      WHERE n.id = nanny_availability.nanny_id
      AND n.visible_in_match_making = true
    )
  );

-- Admin read access
CREATE POLICY "Admin read all availability"
  ON nanny_availability FOR SELECT
  TO authenticated
  USING (auth.is_admin());
```

---

### 10. nanny_credentials

```sql
ALTER TABLE nanny_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE nanny_credentials FORCE ROW LEVEL SECURITY;

-- Nannies manage own credentials
CREATE POLICY "Nannies manage own credentials"
  ON nanny_credentials FOR ALL
  TO authenticated
  USING (nanny_id = auth.nanny_id())
  WITH CHECK (
    nanny_id = auth.nanny_id() AND
    -- Cannot self-verify
    (verified IS NULL OR verified = false)
  );

-- Parents can read verified credentials
CREATE POLICY "Parents read verified credentials"
  ON nanny_credentials FOR SELECT
  TO authenticated
  USING (
    auth.is_parent() AND
    verified = true AND
    EXISTS (
      SELECT 1 FROM nannies n
      WHERE n.id = nanny_credentials.nanny_id
      AND n.visible_in_match_making = true
    )
  );

-- Admin full access
CREATE POLICY "Admin manage credentials"
  ON nanny_credentials FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 11. nanny_assurances

```sql
ALTER TABLE nanny_assurances ENABLE ROW LEVEL SECURITY;
ALTER TABLE nanny_assurances FORCE ROW LEVEL SECURITY;

-- Nannies manage own assurances
CREATE POLICY "Nannies manage own assurances"
  ON nanny_assurances FOR ALL
  TO authenticated
  USING (nanny_id = auth.nanny_id())
  WITH CHECK (
    nanny_id = auth.nanny_id() AND
    -- Cannot self-verify
    (verified IS NULL OR verified = false)
  );

-- Parents read verified assurances
CREATE POLICY "Parents read verified assurances"
  ON nanny_assurances FOR SELECT
  TO authenticated
  USING (
    auth.is_parent() AND
    verified = true AND
    EXISTS (
      SELECT 1 FROM nannies n
      WHERE n.id = nanny_assurances.nanny_id
      AND n.visible_in_match_making = true
    )
  );

-- Admin full access
CREATE POLICY "Admin manage assurances"
  ON nanny_assurances FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 12. nanny_images

```sql
ALTER TABLE nanny_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE nanny_images FORCE ROW LEVEL SECURITY;

-- Nannies manage own images
CREATE POLICY "Nannies manage own images"
  ON nanny_images FOR ALL
  TO authenticated
  USING (nanny_id = auth.nanny_id())
  WITH CHECK (
    nanny_id = auth.nanny_id() AND
    -- Cannot self-approve
    (approved IS NULL OR approved = false)
  );

-- Parents see approved images of verified nannies
CREATE POLICY "Parents view approved images"
  ON nanny_images FOR SELECT
  TO authenticated
  USING (
    auth.is_parent() AND
    approved = true AND
    EXISTS (
      SELECT 1 FROM nannies n
      WHERE n.id = nanny_images.nanny_id
      AND n.visible_in_match_making = true
    )
  );

-- Admin full access
CREATE POLICY "Admin manage images"
  ON nanny_images FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 13. nanny_ai_content

```sql
ALTER TABLE nanny_ai_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE nanny_ai_content FORCE ROW LEVEL SECURITY;

-- Nannies read own AI content
CREATE POLICY "Nannies read own AI content"
  ON nanny_ai_content FOR SELECT
  TO authenticated
  USING (nanny_id = auth.nanny_id());

-- System generates content (service role)

-- Parents see approved, active AI content
CREATE POLICY "Parents view approved AI content"
  ON nanny_ai_content FOR SELECT
  TO authenticated
  USING (
    auth.is_parent() AND
    approved = true AND
    is_active = true AND
    EXISTS (
      SELECT 1 FROM nannies n
      WHERE n.id = nanny_ai_content.nanny_id
      AND n.visible_in_match_making = true
    )
  );

-- Admin full access
CREATE POLICY "Admin manage AI content"
  ON nanny_ai_content FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 14. parents

```sql
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents FORCE ROW LEVEL SECURITY;

-- Parents manage own record
CREATE POLICY "Parents manage own record"
  ON parents FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND auth.is_parent())
  WITH CHECK (user_id = auth.uid() AND auth.is_parent());

-- Nannies can read parents who sent them requests
CREATE POLICY "Nannies read requesting parents"
  ON parents FOR SELECT
  TO authenticated
  USING (
    auth.is_nanny() AND
    EXISTS (
      SELECT 1 FROM interview_requests ir
      WHERE ir.parent_id = parents.id
      AND ir.nanny_id = auth.nanny_id()
    )
  );

-- Nannies can read parents who notified them for BSR
CREATE POLICY "Nannies read BSR parents"
  ON parents FOR SELECT
  TO authenticated
  USING (
    auth.is_nanny() AND
    EXISTS (
      SELECT 1 FROM bsr_notifications bn
      JOIN babysitting_requests br ON bn.babysitting_request_id = br.id
      WHERE br.parent_id = parents.id
      AND bn.nanny_id = auth.nanny_id()
    )
  );

-- Admin full access
CREATE POLICY "Admin manage parents"
  ON parents FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 15. nanny_positions

```sql
ALTER TABLE nanny_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nanny_positions FORCE ROW LEVEL SECURITY;

-- Parents manage own positions
CREATE POLICY "Parents manage own positions"
  ON nanny_positions FOR ALL
  TO authenticated
  USING (parent_id = auth.parent_id())
  WITH CHECK (parent_id = auth.parent_id());

-- Nannies can read positions for their interview requests
CREATE POLICY "Nannies read interview positions"
  ON nanny_positions FOR SELECT
  TO authenticated
  USING (
    auth.is_nanny() AND
    EXISTS (
      SELECT 1 FROM interview_requests ir
      WHERE ir.position_id = nanny_positions.id
      AND ir.nanny_id = auth.nanny_id()
    )
  );

-- Verified nannies can read active positions (for browsing)
CREATE POLICY "Verified nannies browse positions"
  ON nanny_positions FOR SELECT
  TO authenticated
  USING (
    auth.is_nanny() AND
    status = 'active' AND
    EXISTS (
      SELECT 1 FROM nannies n
      WHERE n.id = auth.nanny_id()
      AND n.visible_in_match_making = true
    )
  );

-- Admin full access
CREATE POLICY "Admin manage positions"
  ON nanny_positions FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 16. position_schedule

```sql
ALTER TABLE position_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_schedule FORCE ROW LEVEL SECURITY;

-- Parents manage own position schedules
CREATE POLICY "Parents manage position schedules"
  ON position_schedule FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nanny_positions np
      WHERE np.id = position_schedule.position_id
      AND np.parent_id = auth.parent_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nanny_positions np
      WHERE np.id = position_schedule.position_id
      AND np.parent_id = auth.parent_id()
    )
  );

-- Nannies read schedules for their requests
CREATE POLICY "Nannies read request schedules"
  ON position_schedule FOR SELECT
  TO authenticated
  USING (
    auth.is_nanny() AND
    EXISTS (
      SELECT 1 FROM interview_requests ir
      WHERE ir.position_id = position_schedule.position_id
      AND ir.nanny_id = auth.nanny_id()
    )
  );

-- Admin full access
CREATE POLICY "Admin read schedules"
  ON position_schedule FOR SELECT
  TO authenticated
  USING (auth.is_admin());
```

---

### 17. position_children

```sql
ALTER TABLE position_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_children FORCE ROW LEVEL SECURITY;

-- Parents manage own position children
CREATE POLICY "Parents manage position children"
  ON position_children FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nanny_positions np
      WHERE np.id = position_children.position_id
      AND np.parent_id = auth.parent_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nanny_positions np
      WHERE np.id = position_children.position_id
      AND np.parent_id = auth.parent_id()
    )
  );

-- Nannies read children info for their requests
CREATE POLICY "Nannies read request children"
  ON position_children FOR SELECT
  TO authenticated
  USING (
    auth.is_nanny() AND
    EXISTS (
      SELECT 1 FROM interview_requests ir
      WHERE ir.position_id = position_children.position_id
      AND ir.nanny_id = auth.nanny_id()
    )
  );

-- Admin read access
CREATE POLICY "Admin read children"
  ON position_children FOR SELECT
  TO authenticated
  USING (auth.is_admin());
```

---

### 18. interview_requests

```sql
ALTER TABLE interview_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_requests FORCE ROW LEVEL SECURITY;

-- Parents manage own requests
CREATE POLICY "Parents manage own requests"
  ON interview_requests FOR ALL
  TO authenticated
  USING (parent_id = auth.parent_id())
  WITH CHECK (parent_id = auth.parent_id());

-- Nannies read and respond to their requests
CREATE POLICY "Nannies read own requests"
  ON interview_requests FOR SELECT
  TO authenticated
  USING (nanny_id = auth.nanny_id());

CREATE POLICY "Nannies respond to requests"
  ON interview_requests FOR UPDATE
  TO authenticated
  USING (nanny_id = auth.nanny_id())
  WITH CHECK (
    nanny_id = auth.nanny_id() AND
    -- Can only update response fields
    NEW.parent_id = OLD.parent_id AND
    NEW.nanny_id = OLD.nanny_id
  );

-- Admin full access
CREATE POLICY "Admin manage interview requests"
  ON interview_requests FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 19. babysitting_requests

```sql
ALTER TABLE babysitting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE babysitting_requests FORCE ROW LEVEL SECURITY;

-- Parents manage own BSR
CREATE POLICY "Parents manage own BSR"
  ON babysitting_requests FOR ALL
  TO authenticated
  USING (parent_id = auth.parent_id())
  WITH CHECK (parent_id = auth.parent_id());

-- Nannies read BSR they were notified about
CREATE POLICY "Nannies read notified BSR"
  ON babysitting_requests FOR SELECT
  TO authenticated
  USING (
    auth.is_nanny() AND
    EXISTS (
      SELECT 1 FROM bsr_notifications bn
      WHERE bn.babysitting_request_id = babysitting_requests.id
      AND bn.nanny_id = auth.nanny_id()
    )
  );

-- Admin full access
CREATE POLICY "Admin manage BSR"
  ON babysitting_requests FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 20. bsr_time_slots

```sql
ALTER TABLE bsr_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE bsr_time_slots FORCE ROW LEVEL SECURITY;

-- Parents manage slots for own BSR
CREATE POLICY "Parents manage BSR slots"
  ON bsr_time_slots FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM babysitting_requests br
      WHERE br.id = bsr_time_slots.babysitting_request_id
      AND br.parent_id = auth.parent_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM babysitting_requests br
      WHERE br.id = bsr_time_slots.babysitting_request_id
      AND br.parent_id = auth.parent_id()
    )
  );

-- Nannies read slots for notified BSR
CREATE POLICY "Nannies read BSR slots"
  ON bsr_time_slots FOR SELECT
  TO authenticated
  USING (
    auth.is_nanny() AND
    EXISTS (
      SELECT 1 FROM bsr_notifications bn
      WHERE bn.babysitting_request_id = bsr_time_slots.babysitting_request_id
      AND bn.nanny_id = auth.nanny_id()
    )
  );

-- Admin read access
CREATE POLICY "Admin read BSR slots"
  ON bsr_time_slots FOR SELECT
  TO authenticated
  USING (auth.is_admin());
```

---

### 21. bsr_notifications

```sql
ALTER TABLE bsr_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bsr_notifications FORCE ROW LEVEL SECURITY;

-- Parents read notifications for own BSR
CREATE POLICY "Parents read own BSR notifications"
  ON bsr_notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM babysitting_requests br
      WHERE br.id = bsr_notifications.babysitting_request_id
      AND br.parent_id = auth.parent_id()
    )
  );

-- Nannies read own notifications
CREATE POLICY "Nannies read own notifications"
  ON bsr_notifications FOR SELECT
  TO authenticated
  USING (nanny_id = auth.nanny_id());

-- Nannies can respond (accept/decline)
CREATE POLICY "Nannies respond to notifications"
  ON bsr_notifications FOR UPDATE
  TO authenticated
  USING (nanny_id = auth.nanny_id())
  WITH CHECK (
    nanny_id = auth.nanny_id() AND
    -- Can only update response fields
    NEW.babysitting_request_id = OLD.babysitting_request_id AND
    NEW.nanny_id = OLD.nanny_id
  );

-- System creates notifications (service role)

-- Admin full access
CREATE POLICY "Admin manage BSR notifications"
  ON bsr_notifications FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 22. nanny_placements

```sql
ALTER TABLE nanny_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE nanny_placements FORCE ROW LEVEL SECURITY;

-- Nannies read own placements
CREATE POLICY "Nannies read own placements"
  ON nanny_placements FOR SELECT
  TO authenticated
  USING (nanny_id = auth.nanny_id());

-- Parents read own placements
CREATE POLICY "Parents read own placements"
  ON nanny_placements FOR SELECT
  TO authenticated
  USING (parent_id = auth.parent_id());

-- Nannies can update satisfaction ratings
CREATE POLICY "Nannies update placement ratings"
  ON nanny_placements FOR UPDATE
  TO authenticated
  USING (nanny_id = auth.nanny_id())
  WITH CHECK (
    nanny_id = auth.nanny_id() AND
    -- Can only update nanny satisfaction fields
    NEW.parent_id = OLD.parent_id AND
    NEW.nanny_id = OLD.nanny_id AND
    NEW.status = OLD.status
  );

-- Parents can update satisfaction ratings
CREATE POLICY "Parents update placement ratings"
  ON nanny_placements FOR UPDATE
  TO authenticated
  USING (parent_id = auth.parent_id())
  WITH CHECK (
    parent_id = auth.parent_id() AND
    -- Can only update parent satisfaction fields
    NEW.parent_id = OLD.parent_id AND
    NEW.nanny_id = OLD.nanny_id
  );

-- Admin full access (creates placements)
CREATE POLICY "Admin manage placements"
  ON nanny_placements FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

### 23. file_retention_log

```sql
ALTER TABLE file_retention_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_retention_log FORCE ROW LEVEL SECURITY;

-- Only admin can access file retention logs
CREATE POLICY "Admin manage file retention"
  ON file_retention_log FOR ALL
  TO authenticated
  USING (auth.is_admin())
  WITH CHECK (auth.is_admin());
```

---

## Policy Summary Matrix

| Table | Public | Nanny | Parent | Admin |
|-------|--------|-------|--------|-------|
| user_roles | ❌ | Own | Own | Full |
| user_profiles | ❌ | Own + Verified | Own + Verified Nannies | Full |
| sydney_postcodes | ❌ | Read | Read | Full |
| verifications | ❌ | Own | ❌ | Full |
| activity_logs | ❌ | Own | Own | Full |
| email_logs | ❌ | Own | Own | Full |
| user_progress | ❌ | Own | Own | Full |
| nannies | ❌ | Own + Verified | Verified | Full |
| nanny_availability | ❌ | Own | Verified | Full |
| nanny_credentials | ❌ | Own | Verified + Approved | Full |
| nanny_assurances | ❌ | Own | Verified + Approved | Full |
| nanny_images | ❌ | Own | Approved | Full |
| nanny_ai_content | ❌ | Own | Approved | Full |
| parents | ❌ | Requesting | Own | Full |
| nanny_positions | ❌ | Requesting + Browse | Own | Full |
| position_schedule | ❌ | Requesting | Own | Full |
| position_children | ❌ | Requesting | Own | Full |
| interview_requests | ❌ | Own | Own | Full |
| babysitting_requests | ❌ | Notified | Own | Full |
| bsr_time_slots | ❌ | Notified | Own | Full |
| bsr_notifications | ❌ | Own | BSR Owner | Full |
| nanny_placements | ❌ | Own | Own | Full |
| file_retention_log | ❌ | ❌ | ❌ | Full |

---

## Implementation Checklist

### Phase 1: Core Setup
- [ ] Create helper functions
- [ ] Enable RLS on all tables
- [ ] Implement user_roles policies
- [ ] Implement user_profiles policies

### Phase 2: Nanny Tables
- [ ] nannies policies
- [ ] nanny_availability policies
- [ ] nanny_credentials policies
- [ ] nanny_assurances policies
- [ ] nanny_images policies
- [ ] nanny_ai_content policies
- [ ] verifications policies

### Phase 3: Parent Tables
- [ ] parents policies
- [ ] nanny_positions policies
- [ ] position_schedule policies
- [ ] position_children policies

### Phase 4: Matching Tables
- [ ] interview_requests policies
- [ ] babysitting_requests policies
- [ ] bsr_time_slots policies
- [ ] bsr_notifications policies
- [ ] nanny_placements policies

### Phase 5: System Tables
- [ ] activity_logs policies
- [ ] email_logs policies
- [ ] user_progress policies
- [ ] file_retention_log policies
- [ ] sydney_postcodes policies

### Phase 6: Testing
- [ ] Test nanny signup flow
- [ ] Test parent signup flow
- [ ] Test interview request flow
- [ ] Test BSR notification flow
- [ ] Test admin verification flow
- [ ] Test cross-role access denial

---

## Testing Guidelines

### Test Scenarios

1. **Nanny Self-Access**
   - ✅ Can read own profile
   - ✅ Can update own profile
   - ❌ Cannot modify verification status
   - ❌ Cannot read other nanny's unverified data

2. **Parent Matching Access**
   - ✅ Can read verified nanny profiles
   - ✅ Can read approved images
   - ❌ Cannot read unverified nanny data
   - ❌ Cannot read other parent data

3. **Cross-Role Protection**
   - ❌ Nanny cannot read parent positions (unless requested)
   - ❌ Parent cannot read nanny verifications
   - ❌ Neither can access admin-only tables

4. **Admin Capabilities**
   - ✅ Can read all data
   - ✅ Can update verification status
   - ✅ Can manage placements
   - ❌ Cannot delete user personal data (audit trail)

---

## Security Notes

### Best Practices Implemented

1. **Principle of Least Privilege**
   - Users only see data they need
   - Write access limited to own data
   - Verification fields protected

2. **Defense in Depth**
   - RLS + API validation
   - Cannot bypass via direct DB access
   - Service role for system operations

3. **Audit Trail**
   - All actions logged
   - Logs cannot be modified by users
   - Admin actions tracked

### Potential Risks Mitigated

| Risk | Mitigation |
|------|------------|
| Self-verification | Check constraints prevent nannies from verifying themselves |
| Data enumeration | Partial indexes limit visible records |
| Cross-tenant access | Foreign key checks in USING clauses |
| Privilege escalation | Role changes require super_admin |

---

## Maintenance

### Regular Review Tasks

1. **Monthly:** Audit policy effectiveness
2. **Quarterly:** Review access patterns in logs
3. **Annually:** Security assessment
4. **On Change:** Update policies when schema changes

### Performance Considerations

- Helper functions use SECURITY DEFINER for efficiency
- Policies use indexed columns where possible
- Complex conditions broken into multiple policies
- EXISTS subqueries for relationship checks

---

**Document Status:** ✅ Ready for Implementation
**Last Review:** 2026-02-05
**Next Review:** Before soft launch
