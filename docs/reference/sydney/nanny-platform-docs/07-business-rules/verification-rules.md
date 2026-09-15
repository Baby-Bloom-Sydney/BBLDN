> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# Verification Rules

## Nanny Verification Tiers

**Tier 1: Profile Created**
- Complete profile form
- Profile visible publicly
- Cannot receive interview or babysitting requests

**Tier 2: Identity Verified** (verification_level = 2)
- Passport verified (AI + admin review)
- WWCC document verified (AI + admin review)
- Can receive interview requests from parents
- Cannot access babysitting pool
- Status: PROVISIONALLY_VERIFIED (30) — awaiting OCG confirmation

**Tier 3: Fully Verified** (verification_level = 4)
- Tier 2 complete
- **OCG (Office of the Children's Guardian) has confirmed WWCC as CLEARED**
- OCG verification is the AUTHORITATIVE source — only path to Fully Verified
- Full access including babysitting pool
- Database constraint enforces: `verification_status = 40` requires `ocg_result_status = 'CLEARED'`

## OCG WWCC Verification Results

When the admin checks a nanny's WWCC on the OCG portal, the result is sent automatically via email → Make.com → webhook. Each status triggers a different system response:

| OCG Result | System Action | Nanny Level | Can Retry? |
|---|---|---|---|
| **CLEARED** | Fully verified, nanny active | 4 (Fully Verified) | N/A |
| **NOT FOUND** | Downgrade, resubmit guidance | 2 (ID Verified) | Yes |
| **EXPIRED** | Downgrade, resubmit + OCG link | 2 (ID Verified) | Yes |
| **CLOSED** | Downgrade, resubmit + OCG link | 2 (ID Verified) | Yes |
| **APPLICATION IN PROGRESS** | Downgrade, wait guidance | 2 (ID Verified) | Yes (wait) |
| **BARRED** | Account SUSPENDED, no retry | 0 (Signed Up) | NO |
| **INTERIM BARRED** | Account SUSPENDED, no retry | 0 (Signed Up) | NO |

**BARRED/INTERIM BAR**: Account is closed. Nanny status set to `suspended`. Profile hidden from all matchmaking. No retry button shown. Must contact Baby Bloom.

## WWCC Expiry Handling

- OCG expiry date (`ocg_expiry_date`) is the authoritative expiry when available
- Daily cron `check_wwcc_expiry()` checks both `ocg_expiry_date` and `wwcc_expiry_date`
- When expired: `wwcc_verified = false`, `verification_level = 2`, nanny hidden from matchmaking
- 30-day and 7-day email warnings sent before expiry

## Parent Verification

**Basic Account**
- Signup only
- Can browse profiles and see availability
- Cannot request interviews

**With Open Nanny Position**
- Complete preference form
- Can request interviews
- Only ONE position allowed at a time

**First Babysitting (ID Verification)**
- First babysitting job requires parent ID verification
- Address shared with nanny only after verification
- Future jobs: no re-verification needed
