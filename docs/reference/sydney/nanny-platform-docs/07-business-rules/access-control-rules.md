> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# Access Control Rules

## What Actions Require What Access

**Public (No Account)**
- Browse nanny profiles
- Cannot see availability
- Cannot request interviews
- Cannot post babysitting requests

**Parent - Logged In**
- See nanny availability calendars
- Cannot request interviews (need Open Position)

**Parent - With Open Position**
- Request interviews with nannies
- Only ONE Open Position at a time
- Can close position anytime
- Auto-closes when position filled or after inactivity

**Parent - Babysitting**
- Can post babysitting requests (separate from Nanny Positions)
- Only ONE babysitting request open at a time
- Max 7 time slots per request
- One nanny accepts entire request (all slots)

**Nanny - Tier 2 Verified**
- Can receive interview requests

**Nanny - Tier 3 Verified**
- Can receive babysitting requests
- Access to babysitting pool

## Interview Request Rules

- Parent must share 3 available time slots
- Baby Bloom emails nanny separately
- Baby Bloom emails parent separately
- AI coordinates the scheduling
- Calendar invites sent to both

## Babysitting Request Rules

- Parent posts request (currently requires FB share, future: optional payment)
- 20 closest Tier 3 nannies notified simultaneously
- First-come-first-serve acceptance
- One nanny gets entire job (all time slots)
