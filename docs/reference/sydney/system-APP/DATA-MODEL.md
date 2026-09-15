> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Data Model

Schema changes required by the payments system. Three new tables + a
handful of column additions. All additive — nothing in the existing
schema is dropped or renamed.

> **Pre-req:** the child-linking redesign migration must be applied
> first. This payments migration depends on `child_invites`,
> `child_client.parent_user_id`, and the `connect_child_invite()` PG
> function.

## Summary of changes

| # | Change | Risk |
|---|--------|------|
| 1 | New `parent_subscriptions` table — one row per parent (family) capturing trial + subscription state | Low |
| 2 | New `nanny_payouts` table — one row per scheduled or completed payout | Low |
| 3 | New `earnings_events` table — shadow ledger of v2-shaped engagement values, written from day 1 | Low — additive |
| 4 | New `refund_requests` table — manual review queue | Low |
| 5 | `nannies` — add `abn`, `stripe_connect_account_id`, `charges_enabled`, `payouts_enabled`, `connect_onboarded_at`, `payout_application_status`, `payout_application_started_at` | Low |
| 6 | `parents` — add `stripe_customer_id` | Low |
| 7 | `child_client` — add `feed_locked_for_nanny` BOOLEAN (the soft-lock from §5 of business model) | Low |
| 8 | `child_invites` — add `family_trial_started_at` to track first connect that started the family trial | Low |
| 9 | New helper functions — `family_has_access()`, `start_family_trial_if_first()`, `update_soft_lock()` | Low |
| 10 | RLS policies on all new tables | Low |
| 11 | Webhook event log table `stripe_webhook_events` for idempotency | Low |
| 12 | `user_profiles.is_test_user` BOOLEAN — bypasses every payment gate (see business model §11) | Low |

## Up migration — full SQL

```sql
-- ============================================================================
-- Migration: Payments — subscriptions, payouts, refunds, soft-lock
-- File: app/supabase/migrations/payments-foundation.sql
-- Pre-req: child-invites.sql migration must already be applied.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Extend activity_logs CHECK constraint to allow new payment events.
--    activity_logs.action_type is a CHECK-constrained enum in the existing
--    schema (see docs/04-technical/database/supabase-setup.sql:251).
--    All new payment events must be added to the allowed set or INSERTs fail.
-- ----------------------------------------------------------------------------
ALTER TABLE activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_action_type_check;

-- Re-add with all existing values plus our new payment events.
-- Agent: this list must include every value already in the existing constraint
-- — pull them from supabase-setup.sql before running this migration.
ALTER TABLE activity_logs
  ADD CONSTRAINT activity_logs_action_type_check
  CHECK (action_type IN (
    -- ... existing values ...
    'trial_started',
    'trial_lapsed',
    'subscription_started',
    'subscription_renewed',
    'subscription_past_due',
    'subscription_recovered',
    'subscription_cancelled',
    'subscription_lapsed',
    'subscription_converted_upfront_to_monthly',
    'trial_notification_sent',
    'conversion_notification_sent',
    'commission_scheduled',
    'commission_released',
    'commission_held',
    'commission_cancelled',
    'payout_send_failed',
    'payout_paid',
    'payout_failed',
    'payout_application_started',
    'payout_application_status_changed',
    'nanny_account_updated',
    'refund_requested',
    'refund_decision',
    'refund_processed',
    'refund_processing_failed',
    'refund_manually_completed',
    'duplicate_checkout_refunded',
    'test_user_flag_changed',
    'stripe_webhook_received',
    'stripe_webhook_processed',
    'stripe_reconciliation_drift',
    'cron_run',
    'kill_switch_blocked',
    'serr_report_generated',
    'serr_report_lodged',
    'payouts_held_due_to_no_abn'
  ));


-- ----------------------------------------------------------------------------
-- 1. parent_subscriptions
--    Per-family subscription state. Supersedes the per-child sketch from
--    Nanny:Parent child linking/09 §1.
-- ----------------------------------------------------------------------------
CREATE TABLE parent_subscriptions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- State machine (see 05-trial-and-access-gates.md for transitions)
  status                      TEXT NOT NULL CHECK (status IN (
    'trial',           -- 30-day free trial, no payment yet
    'active_monthly',  -- paid monthly, recurring
    'active_upfront',  -- paid upfront lump sum, until child's 5th birthday
    'past_due',        -- payment failed, in dunning grace
    'cancelled',       -- user cancelled; access until paid_period_ends_at
    'lapsed'           -- access window ended, no recovery flow active
  )),

  -- Trial window
  trial_started_at            TIMESTAMPTZ,
  trial_ends_at               TIMESTAMPTZ,

  -- Active subscription window
  paid_period_starts_at       TIMESTAMPTZ,
  paid_period_ends_at         TIMESTAMPTZ,

  -- Lifetime trial guard (true once a trial has been used; prevents new trials)
  has_used_trial              BOOLEAN NOT NULL DEFAULT FALSE,

  -- Stripe linkage
  stripe_customer_id          TEXT,                     -- denormalised from parents for query speed
  stripe_subscription_id      TEXT,                     -- monthly only
  stripe_payment_intent_id    TEXT,                     -- upfront only

  -- Cancellation tracking
  cancelled_at                TIMESTAMPTZ,
  cancellation_reason         TEXT,                     -- free-text, optional

  -- Past-due grace window — set when invoice.payment_failed fires.
  -- Used by family_has_access() instead of the leaky paid_period_ends_at math.
  past_due_grace_ends_at      TIMESTAMPTZ,

  -- Resubscription cycle counter — increments each time the parent re-subscribes
  -- after a cancellation. Used by SERR / audit queries that need to disambiguate
  -- distinct revenue periods sharing the same parent_subscriptions.id.
  subscription_cycle          INTEGER NOT NULL DEFAULT 1,

  -- Audit
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lifetime-one-trial-per-parent: only one subscription row per parent.
-- (If they cancel and resubscribe, same row is reused — fields update.)
CREATE UNIQUE INDEX idx_parent_subscriptions_one_per_parent
  ON parent_subscriptions(parent_user_id);

CREATE INDEX idx_parent_subscriptions_status
  ON parent_subscriptions(status);

CREATE INDEX idx_parent_subscriptions_active
  ON parent_subscriptions(parent_user_id)
  WHERE status IN ('trial', 'active_monthly', 'active_upfront', 'past_due');

CREATE INDEX idx_parent_subscriptions_stripe_customer
  ON parent_subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX idx_parent_subscriptions_stripe_subscription
  ON parent_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TRIGGER set_parent_subscriptions_updated_at
  BEFORE UPDATE ON parent_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE parent_subscriptions IS
  'One row per parent (family). Tracks trial state + active subscription. Per-family, not per-child — multi-child families share one subscription.';
COMMENT ON COLUMN parent_subscriptions.has_used_trial IS
  'Lifetime guard. True once any trial has started. Prevents new trials after a lapse-and-return.';
COMMENT ON COLUMN parent_subscriptions.paid_period_ends_at IS
  'For active_monthly: end of current paid period. For active_upfront: child''s 5th birthday or upfront-end-date.';


-- ----------------------------------------------------------------------------
-- 2. nanny_payouts
--    Each scheduled or completed payout to a nanny. v1 commission engine
--    inserts rows here; Stripe Connect pays them out; webhook updates status.
-- ----------------------------------------------------------------------------
CREATE TABLE nanny_payouts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nanny_user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
                                          -- RESTRICT — never silently delete payout records on user deletion
  parent_user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
                                          -- The family that generated this commission. RESTRICT for audit.
  parent_subscription_id      UUID NOT NULL REFERENCES parent_subscriptions(id) ON DELETE RESTRICT,

  -- Period this payout covers (calendar window)
  period_start                DATE NOT NULL,
  period_end                  DATE NOT NULL,

  -- v1: flat amount per the commission policy
  -- v2: derived from earnings_events, but stored here as the final number
  amount_aud_cents            INTEGER NOT NULL CHECK (amount_aud_cents >= 0),
  commission_model_version    TEXT NOT NULL DEFAULT 'v1_flat'
    CHECK (commission_model_version IN ('v1_flat', 'v2_engagement')),

  -- Lifecycle
  status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',           -- created but not yet sent (e.g. waiting for second-payment safeguard, or nanny not yet onboarded to Connect)
    'held',              -- nanny hasn't completed Connect onboarding; held in BB platform balance
    'sending',           -- in-flight: cron is currently calling stripe.transfers.create. Refund flow must NOT cancel rows in this state.
    'sent',              -- transfer accepted by Stripe; awaiting transfer.updated webhook
    'paid',              -- Stripe webhook confirmed transfer settled to nanny's bank
    'failed',            -- Stripe transfer or payout failed
    'cancelled'          -- Refund or admin override (only allowed from pending or held)
  )),

  -- Stripe linkage (set on send)
  stripe_transfer_id          TEXT,
  scheduled_release_at        TIMESTAMPTZ NOT NULL,    -- earliest date this payout can be sent
  sent_at                     TIMESTAMPTZ,
  paid_at                     TIMESTAMPTZ,
  failed_at                   TIMESTAMPTZ,
  failure_reason              TEXT,

  -- Audit
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nanny_payouts_nanny       ON nanny_payouts(nanny_user_id);
CREATE INDEX idx_nanny_payouts_parent      ON nanny_payouts(parent_user_id);
CREATE INDEX idx_nanny_payouts_subscription ON nanny_payouts(parent_subscription_id);
CREATE INDEX idx_nanny_payouts_status      ON nanny_payouts(status);
CREATE INDEX idx_nanny_payouts_releasable
  ON nanny_payouts(scheduled_release_at)
  WHERE status IN ('pending', 'held');
CREATE INDEX idx_nanny_payouts_stripe_transfer
  ON nanny_payouts(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

-- CRITICAL: prevent duplicate commission rows for the same period.
-- A retried `invoice.payment_succeeded` webhook (Stripe's 3-day retry policy)
-- could otherwise create duplicate A$100 rows that all release.
CREATE UNIQUE INDEX idx_nanny_payouts_unique_per_period
  ON nanny_payouts(parent_subscription_id, period_start)
  WHERE status != 'cancelled';

CREATE TRIGGER set_nanny_payouts_updated_at
  BEFORE UPDATE ON nanny_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE nanny_payouts IS
  'Each scheduled or completed payout to a nanny. v1 commission engine inserts rows on a monthly cron after the second-payment safeguard.';
COMMENT ON COLUMN nanny_payouts.scheduled_release_at IS
  'The earliest date this payout can be sent. Enforces the second-payment safeguard (~30 days post-first-paid-charge).';


-- ----------------------------------------------------------------------------
-- 3. earnings_events
--    Shadow ledger that captures what a nanny WOULD have earned under
--    v2 (gamified engagement model), written from day 1 even though v1
--    pays a flat amount. v2 launch then has historical data to populate
--    its dashboard from.
-- ----------------------------------------------------------------------------
CREATE TABLE earnings_events (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nanny_user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_client_id             UUID NOT NULL REFERENCES child_client(id) ON DELETE CASCADE,

  -- What triggered this earning event
  event_kind                  TEXT NOT NULL CHECK (event_kind IN (
    'activity_logged',
    'observation_logged',
    'report_completed',
    'diary_entry',
    'progress_update',
    'photo_uploaded'
    -- extensible: add new kinds as v2 design evolves
  )),

  -- Reference to the source row in bapp_logs (or wherever the event came from)
  source_table                TEXT NOT NULL,
  source_id                   UUID NOT NULL,

  -- Calculated v2-style value of this event in cents (rules in commission engine module)
  earnings_value_aud_cents    INTEGER NOT NULL CHECK (earnings_value_aud_cents >= 0),

  -- Whether this event has been counted toward a payout (true once a nanny_payouts row consumes it)
  applied_to_payout_id        UUID REFERENCES nanny_payouts(id) ON DELETE SET NULL,

  occurred_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_earnings_events_nanny       ON earnings_events(nanny_user_id);
CREATE INDEX idx_earnings_events_parent      ON earnings_events(parent_user_id);
CREATE INDEX idx_earnings_events_unapplied   ON earnings_events(nanny_user_id, occurred_at)
  WHERE applied_to_payout_id IS NULL;
CREATE INDEX idx_earnings_events_source      ON earnings_events(source_table, source_id);

COMMENT ON TABLE earnings_events IS
  'Shadow ledger. v1 inserts rows but does not use them for payout calculation. v2 will pay based on these rows. Lets v2 launch with full historical data.';


-- ----------------------------------------------------------------------------
-- 4. refund_requests
--    Manual review queue. All refunds reviewed manually by Bailey/admin.
-- ----------------------------------------------------------------------------
CREATE TABLE refund_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  parent_subscription_id      UUID NOT NULL REFERENCES parent_subscriptions(id) ON DELETE RESTRICT,
  parent_user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- What the parent is asking for
  reason_category             TEXT CHECK (reason_category IN (
    'major_problem',          -- ACL major problem case
    'reasonable_cause',       -- circumstance change
    'change_of_mind',         -- explicit no-cause request
    'other'
  )),
  reason_text                 TEXT NOT NULL,            -- free-text from parent

  -- Calculated by server at time of request (snapshot — not recomputed later)
  calculated_refund_aud_cents INTEGER NOT NULL,
  calculation_breakdown       JSONB NOT NULL,            -- shows the formula working — for transparency in admin UI

  -- Lifecycle
  status                      TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN (
    'pending_review',
    'pending_processing',     -- admin approved; Stripe call in flight or failed mid-process
    'approved',
    'denied',
    'partially_approved',     -- approved at lower amount than requested
    'cancelled_by_user'
  )),

  -- Resolution
  reviewed_by_user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at                 TIMESTAMPTZ,
  approved_amount_aud_cents   INTEGER CHECK (approved_amount_aud_cents IS NULL OR approved_amount_aud_cents >= 0),
  reviewer_notes              TEXT,

  -- Stripe linkage (if approved + processed)
  stripe_refund_id            TEXT,
  refund_processed_at         TIMESTAMPTZ,

  -- Audit
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refund_requests_status     ON refund_requests(status);
CREATE INDEX idx_refund_requests_parent     ON refund_requests(parent_user_id);
CREATE INDEX idx_refund_requests_pending    ON refund_requests(created_at)
  WHERE status = 'pending_review';

CREATE TRIGGER set_refund_requests_updated_at
  BEFORE UPDATE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE refund_requests IS
  'Manual review queue for refund requests. Bailey/admin reviews each one. calculation_breakdown JSONB shows the formula math at request time for transparency.';


-- ----------------------------------------------------------------------------
-- 5. nannies — add Stripe Connect fields + payout application state
-- ----------------------------------------------------------------------------
ALTER TABLE nannies
  ADD COLUMN abn                            TEXT,
  ADD COLUMN stripe_connect_account_id      TEXT UNIQUE,
  ADD COLUMN charges_enabled                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN payouts_enabled                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN connect_onboarded_at           TIMESTAMPTZ,
  -- Payout application opt-in state (commission is held until approved)
  ADD COLUMN payout_application_status      TEXT NOT NULL DEFAULT 'not_applied'
    CHECK (payout_application_status IN (
      'not_applied',     -- nanny hasn't tapped Apply yet (default)
      'in_progress',     -- nanny started embedded onboarding, hasn't completed
      'pending_review',  -- nanny submitted; Stripe verifying
      'approved',        -- Stripe verified; payouts_enabled = TRUE
      'requires_action', -- Stripe needs more info from nanny
      'rejected'         -- Stripe rejected (e.g. ABN mismatch, identity fraud)
    )),
  ADD COLUMN payout_application_started_at  TIMESTAMPTZ,
  ADD COLUMN payout_application_completed_at TIMESTAMPTZ;

CREATE INDEX idx_nannies_stripe_connect_account
  ON nannies(stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;

CREATE INDEX idx_nannies_payout_application_status
  ON nannies(payout_application_status)
  WHERE payout_application_status IN ('in_progress', 'pending_review', 'requires_action');

COMMENT ON COLUMN nannies.abn IS
  'Australian Business Number. Required by ATO for payouts >A$75 to avoid 47% PAYG withholding. Collected during Stripe Connect onboarding (embedded).';
COMMENT ON COLUMN nannies.charges_enabled IS
  'Synced from Stripe Connect webhook. True when Stripe has verified the nanny enough to process charges (not directly relevant for our payout-only use, but tracked).';
COMMENT ON COLUMN nannies.payouts_enabled IS
  'Synced from Stripe Connect webhook. True when Stripe will release payouts to the nanny''s bank. Until true, nanny_payouts rows stay in held status.';
COMMENT ON COLUMN nannies.payout_application_status IS
  'Tracks the nanny''s opt-in state for receiving payouts. Commission accrues regardless, but stays held until status = approved. See business model §6 "Payout opt-in" for the full flow.';


-- ----------------------------------------------------------------------------
-- 6. parents — add Stripe customer linkage
-- ----------------------------------------------------------------------------
ALTER TABLE parents
  ADD COLUMN stripe_customer_id           TEXT UNIQUE;

CREATE INDEX idx_parents_stripe_customer
  ON parents(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 7. child_client — add the soft-lock flag (nanny 30-day connect-parent timer)
-- ----------------------------------------------------------------------------
ALTER TABLE child_client
  ADD COLUMN feed_locked_for_nanny        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN feed_locked_at               TIMESTAMPTZ;

CREATE INDEX idx_child_client_feed_locked
  ON child_client(feed_locked_for_nanny)
  WHERE feed_locked_for_nanny = TRUE;

COMMENT ON COLUMN child_client.feed_locked_for_nanny IS
  'Soft-lock flag. True when nanny created child >=30 days ago and no parent has connected yet. Set by daily cron. Cleared automatically by connect_child_invite() when a parent connects.';


-- ----------------------------------------------------------------------------
-- 8. child_invites — add family trial start tracking
-- ----------------------------------------------------------------------------
ALTER TABLE child_invites
  ADD COLUMN family_trial_started_at      TIMESTAMPTZ;

COMMENT ON COLUMN child_invites.family_trial_started_at IS
  'Set on the invite that triggered the family trial (i.e. the first connect for that parent). NULL on subsequent invites for the same parent.';


-- ----------------------------------------------------------------------------
-- 8b. user_profiles — add test-user bypass flag
--     Set true by admin to grant full app access without subscription
--     and to skip all real money flows. See business model §11.
-- ----------------------------------------------------------------------------
ALTER TABLE user_profiles
  ADD COLUMN is_test_user                 BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_user_profiles_test_user
  ON user_profiles(user_id)
  WHERE is_test_user = TRUE;

COMMENT ON COLUMN user_profiles.is_test_user IS
  'When true: family_has_access() returns true regardless of subscription, Stripe ops are skipped, commission flows are skipped if either party in a pair is flagged. Admin-only writable. Used for bogey accounts during testing/QA/demos.';


-- ----------------------------------------------------------------------------
-- 9. stripe_webhook_events — idempotency + audit log
--    Stripe retries failed webhooks; this table prevents duplicate processing.
-- ----------------------------------------------------------------------------
CREATE TABLE stripe_webhook_events (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id             TEXT NOT NULL UNIQUE,        -- evt_xxx from Stripe
  event_type                  TEXT NOT NULL,
  payload                     JSONB NOT NULL,
  received_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at                TIMESTAMPTZ,
  processing_error            TEXT,
  retry_count                 INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_stripe_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX idx_stripe_webhook_events_unprocessed
  ON stripe_webhook_events(received_at)
  WHERE processed_at IS NULL;

COMMENT ON TABLE stripe_webhook_events IS
  'Idempotency log. Webhook handler upserts on stripe_event_id; if already processed, no-op. Audit trail for every Stripe event we received.';


-- ----------------------------------------------------------------------------
-- 10. RLS — all new tables enabled, policies defined
-- ----------------------------------------------------------------------------

-- parent_subscriptions: parent reads their own; admin reads all; writes via SECURITY DEFINER only
ALTER TABLE parent_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parent_reads_own_subscription" ON parent_subscriptions
  FOR SELECT USING (parent_user_id = auth.uid());
CREATE POLICY "admin_reads_all_subscriptions" ON parent_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );
-- (No user UPDATE/INSERT/DELETE policy. All writes go through SECURITY DEFINER functions
--  invoked from server actions running with admin client.)

-- nanny_payouts: nanny reads their own; admin reads all
ALTER TABLE nanny_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nanny_reads_own_payouts" ON nanny_payouts
  FOR SELECT USING (nanny_user_id = auth.uid());
CREATE POLICY "admin_reads_all_payouts" ON nanny_payouts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- earnings_events: nanny reads their own (for v2 dashboard); admin reads all
ALTER TABLE earnings_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nanny_reads_own_earnings_events" ON earnings_events
  FOR SELECT USING (nanny_user_id = auth.uid());

-- refund_requests: parent reads own; admin reads/updates all; user can create their own
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parent_reads_own_refund_requests" ON refund_requests
  FOR SELECT USING (parent_user_id = auth.uid());
CREATE POLICY "parent_creates_own_refund_request" ON refund_requests
  FOR INSERT WITH CHECK (parent_user_id = auth.uid());
CREATE POLICY "admin_full_refund_access" ON refund_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

-- stripe_webhook_events: no user policy. Service-role only.
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;


-- ----------------------------------------------------------------------------
-- 11. Helper functions
-- ----------------------------------------------------------------------------

-- family_has_access(parent_user_id) → BOOLEAN
-- Returns TRUE if:
--   1. The parent is flagged as a test user (always has access), OR
--   2. The parent has an active trial OR active subscription that hasn't expired.
-- Used by RLS or app-layer access gates.
CREATE OR REPLACE FUNCTION family_has_access(p_parent_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    -- Test-user bypass — checked first, short-circuits
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = p_parent_user_id
        AND is_test_user = TRUE
    )
    OR
    -- Real subscription check.
    -- past_due grace uses an explicit `past_due_grace_ends_at` column
    -- set when invoice.payment_failed fires (= NOW + 7 days). The previous
    -- math (paid_period_ends_at > NOW() - INTERVAL '7 days') leaked grace
    -- past period boundaries.
    EXISTS (
      SELECT 1 FROM parent_subscriptions
      WHERE parent_user_id = p_parent_user_id
        AND (
          (status = 'trial' AND trial_ends_at > NOW())
          OR (status IN ('active_monthly', 'active_upfront') AND paid_period_ends_at > NOW())
          OR (status = 'past_due' AND past_due_grace_ends_at > NOW())
        )
    );
$$;

REVOKE ALL ON FUNCTION family_has_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION family_has_access(UUID) TO authenticated;

-- start_family_trial_if_first(parent_user_id) → BOOLEAN (true if started, false if already had one)
-- Idempotent. Called from connect_child_invite() and createChildAsParent().
-- Honors the lifetime-one-trial guard via has_used_trial.
CREATE OR REPLACE FUNCTION start_family_trial_if_first(p_parent_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_existing_id  UUID;
  v_has_used     BOOLEAN;
  v_is_test_user BOOLEAN;
BEGIN
  -- Test-user short-circuit: never create a subscription row, never start a trial.
  -- Test users have unconditional access via family_has_access().
  SELECT is_test_user INTO v_is_test_user
  FROM user_profiles WHERE user_id = p_parent_user_id;
  IF v_is_test_user THEN
    RETURN FALSE;
  END IF;

  SELECT id, has_used_trial INTO v_existing_id, v_has_used
  FROM parent_subscriptions
  WHERE parent_user_id = p_parent_user_id;

  -- Already had trial → no-op.
  IF v_existing_id IS NOT NULL AND v_has_used THEN
    RETURN FALSE;
  END IF;

  -- No subscription row yet → create one in trial state.
  IF v_existing_id IS NULL THEN
    INSERT INTO parent_subscriptions (
      parent_user_id, status, trial_started_at, trial_ends_at, has_used_trial
    ) VALUES (
      p_parent_user_id, 'trial', NOW(), NOW() + INTERVAL '30 days', TRUE
    );
    RETURN TRUE;
  END IF;

  -- Row exists with has_used_trial=TRUE — already returned FALSE above.
  -- Row should never exist with has_used_trial=FALSE under normal flow
  -- (the lifetime guard would block any path that creates a row without
  -- setting the flag). Defensive abort + log if we hit this:
  RAISE WARNING 'Unexpected subscription row exists without has_used_trial for parent %', p_parent_user_id;
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION start_family_trial_if_first(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_family_trial_if_first(UUID) TO authenticated;

-- update_soft_lock(child_client_id, locked) → VOID
-- Sets or clears the feed_locked_for_nanny flag. Called by daily cron (set)
-- and by connect_child_invite() side-effect (clear).
CREATE OR REPLACE FUNCTION update_soft_lock(p_child_id UUID, p_locked BOOLEAN)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE child_client
  SET feed_locked_for_nanny = p_locked,
      feed_locked_at = CASE WHEN p_locked THEN NOW() ELSE NULL END
  WHERE id = p_child_id;
$$;

REVOKE ALL ON FUNCTION update_soft_lock(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_soft_lock(UUID, BOOLEAN) TO authenticated;

COMMIT;
```

## Down migration

```sql
BEGIN;

-- 11. Functions
DROP FUNCTION IF EXISTS update_soft_lock(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS start_family_trial_if_first(UUID);
DROP FUNCTION IF EXISTS family_has_access(UUID);

-- 9. Webhook events table
DROP TABLE IF EXISTS stripe_webhook_events;

-- 8b. Test-user flag
DROP INDEX IF EXISTS idx_user_profiles_test_user;
ALTER TABLE user_profiles DROP COLUMN IF EXISTS is_test_user;

-- 8. child_invites column
ALTER TABLE child_invites DROP COLUMN IF EXISTS family_trial_started_at;

-- 7. child_client soft-lock columns
DROP INDEX IF EXISTS idx_child_client_feed_locked;
ALTER TABLE child_client
  DROP COLUMN IF EXISTS feed_locked_at,
  DROP COLUMN IF EXISTS feed_locked_for_nanny;

-- 6. parents Stripe customer
DROP INDEX IF EXISTS idx_parents_stripe_customer;
ALTER TABLE parents DROP COLUMN IF EXISTS stripe_customer_id;

-- 5. nannies Stripe Connect columns
DROP INDEX IF EXISTS idx_nannies_payout_application_status;
DROP INDEX IF EXISTS idx_nannies_stripe_connect_account;
ALTER TABLE nannies
  DROP COLUMN IF EXISTS payout_application_completed_at,
  DROP COLUMN IF EXISTS payout_application_started_at,
  DROP COLUMN IF EXISTS payout_application_status,
  DROP COLUMN IF EXISTS connect_onboarded_at,
  DROP COLUMN IF EXISTS payouts_enabled,
  DROP COLUMN IF EXISTS charges_enabled,
  DROP COLUMN IF EXISTS stripe_connect_account_id,
  DROP COLUMN IF EXISTS abn;

-- 4. refund_requests
DROP TABLE IF EXISTS refund_requests;

-- 3. earnings_events
DROP TABLE IF EXISTS earnings_events;

-- 2. nanny_payouts
DROP TABLE IF EXISTS nanny_payouts;

-- 1. parent_subscriptions
DROP TABLE IF EXISTS parent_subscriptions;

COMMIT;
```

## Why these design choices

### Why no `family_subscriptions` rename?

The table is per-parent (parent_user_id PK), but called `parent_subscriptions` to match the existing `parents` table naming convention. "Family" is the conceptual model; "parent" is the technical identifier.

### Why `has_used_trial` boolean separate from status?

Status moves between `trial` → `active_monthly` → `cancelled` → `lapsed` → `active_monthly` (resubscribe). The trial flag is a **lifetime-one-time** guard that survives those transitions. Without it, a parent who cancels and resubscribes could trick us into giving them another trial by being in a non-trial status when the trial-start function runs.

### Why `nanny_payouts.scheduled_release_at` instead of computing on the fly?

The second-payment safeguard means a payout's earliest send date depends on when the parent's first paid charge actually settled (not the subscription start date). Storing this explicitly lets the cron job query simply: `WHERE scheduled_release_at <= NOW() AND status = 'pending'`. Faster, simpler, debuggable.

### Why `earnings_events` from day 1?

So when v2 ships, the gamified dashboard has historical data. If we only started capturing events at v2 launch, every nanny would see a blank earnings history — bad UX. Day-1 capture means v2 launches with months of populated dashboards.

### Why `stripe_webhook_events` for idempotency?

Stripe retries webhooks on failure (5xx response, network timeout). Without idempotency, a flaky network connection could cause us to process the same `invoice.payment_succeeded` event twice → duplicate payout, duplicate access grant. The unique index on `stripe_event_id` is the firewall: webhook handler upserts; if the row exists with `processed_at IS NOT NULL`, no-op.

### Why a `payout_application_status` enum *and* the `payouts_enabled` boolean?

Two different concerns:

- `payout_application_status` is the **nanny's intent**. They've explicitly opted in to becoming a paid contractor. This is BB's record of consent and where the application is in the user-facing flow.
- `payouts_enabled` is **Stripe's verdict**. Set by Stripe webhook when KYC + bank verification clear. Out of BB's control directly.

They usually move together (`approved` + `payouts_enabled = TRUE`) but can diverge:
- Nanny applied (`pending_review`) but Stripe hasn't verified yet (`payouts_enabled = FALSE`) — normal mid-flow state.
- Nanny was approved (`approved` + `payouts_enabled = TRUE`) then their ABN got cancelled → Stripe fires webhook setting `payouts_enabled = FALSE`. We don't downgrade the application status because the nanny did apply — they just need to fix their ABN. UI shows: "Your payout details need attention."

Keeping both fields means we can communicate clearly with the nanny about where the breakdown is + retry logic is unambiguous (we only release `held` payouts when both `payout_application_status = 'approved'` AND `payouts_enabled = TRUE`).

### Why `is_test_user` lives on `user_profiles` (not `auth.users` metadata)?

Two reasons:
1. **Queryable.** Sitting in `auth.users.raw_user_meta_data` JSONB makes it harder to query at scale (no proper index), harder to RLS-policy against, and easier to forget about in admin tooling. A real column with a partial index (`WHERE is_test_user = TRUE`) is the cheapest right answer.
2. **Admin-only writable.** RLS on `user_profiles` is already established. We add a "test_user_flag_admin_only" UPDATE policy gated to admin / super_admin roles. Self-service flag-flipping is impossible by schema.

### Why test-user logic lives in the helper functions, not in app code?

If the test bypass logic was in TypeScript (e.g. `if (user.isTestUser) return true`), every consumer of the access gate would need to remember to check first. Putting it inside `family_has_access()` and `start_family_trial_if_first()` means:
- Every existing caller of these functions automatically respects the bypass.
- Future code that needs an access check just calls the function — no risk of forgetting the test-user case.
- Single source of truth: change the bypass logic in one place if needed.

The same principle is applied in `06-commission-system.md` (commission engine checks for test users on either side before creating payouts) and `04-stripe-integration.md` (Stripe Customer / Connect creation skips test users).

### Why ON DELETE RESTRICT on payment-related FKs?

`nanny_payouts.nanny_user_id` and `nanny_payouts.parent_user_id` use `ON DELETE RESTRICT` rather than CASCADE. Reason: financial records must survive user account deletion for audit + tax reporting (SERR). If a user demands deletion under privacy law, we anonymise their `auth.users` row but the payout history remains. Same for `refund_requests`.

### What this enables for `08-tax-and-compliance.md`

The `nanny_payouts` table has all fields SERR needs: nanny identity (via FK to nannies + auth.users), period_start/period_end, amount_aud_cents, status. The bi-annual SERR XML generator queries this table directly. No additional schema needed for SERR compliance.

## Application-code dependencies

After this migration is applied, the following code changes are required (full detail in `09-server-actions.md`):

- `connect_child_invite()` PG function (in child-linking) gets a side-effect hook to call `start_family_trial_if_first()` and `update_soft_lock(p_child_id, FALSE)`.
- `createChildAsParent` server action gets a similar hook for `start_family_trial_if_first()`.
- New daily cron `/api/cron/soft-lock-stale-children` calls `update_soft_lock(child_id, TRUE)` for every child where `nanny_user_id IS NOT NULL AND parent_user_id IS NULL AND created_at < NOW() - INTERVAL '30 days' AND feed_locked_for_nanny = FALSE`.

## Visual: how the tables relate

```
auth.users
  ├──── parents ──── parent_subscriptions ──── nanny_payouts
  │                          │                       │
  │                          ├── refund_requests     │
  │                          │                       │
  └──── nannies ─────────────┼──── earnings_events ──┘
                             │           │
                             │           └─ child_client (FK)
                             │
                             └─ stripe_customer_id (denormalised)

stripe_webhook_events  (independent log, links via business IDs in payload)
```
