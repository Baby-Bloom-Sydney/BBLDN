> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# User Permissions Matrix

## Public (Unauthenticated)

| Feature | Access |
|---------|--------|
| Browse nanny profiles | ✅ Yes |
| View nanny availability | ❌ No |
| Request interview | ❌ No |
| Post babysitting request | ❌ No |
| See nanny contact info | ❌ No |

---

## Nannies

### Tier 1: Profile Created (Not Verified)

| Feature | Access |
|---------|--------|
| Profile visible publicly | ✅ Yes |
| Receive interview requests | ❌ No (need Tier 2) |
| Receive babysitting requests | ❌ No (need Tier 3) |
| Update profile | ✅ Yes |
| Update availability | ✅ Yes |

### Tier 2: Identity Verified (Passport + WWCC)

| Feature | Access |
|---------|--------|
| Everything from Tier 1 | ✅ Yes |
| Receive interview requests | ✅ Yes |
| Respond to interview requests | ✅ Yes |
| Receive babysitting requests | ❌ No (need Tier 3) |

### Tier 3: Fully Verified (Facebook Post Shared)

| Feature | Access |
|---------|--------|
| Everything from Tier 2 | ✅ Yes |
| Receive babysitting requests | ✅ Yes |
| Accept babysitting jobs | ✅ Yes |
| Full platform access | ✅ Yes |

---

## Parents

### Tier 1: Basic Account (Logged In)

| Feature | Access |
|---------|--------|
| Browse nanny profiles | ✅ Yes |
| View nanny availability | ✅ Yes |
| Request interview | ❌ No (need Open Position) |
| Post babysitting request | ✅ Yes |
| See nanny contact info | ❌ No (facilitated via platform) |

### Tier 2: Open Nanny Position Created

| Feature | Access |
|---------|--------|
| Everything from Tier 1 | ✅ Yes |
| View matched nannies | ✅ Yes |
| Request interviews | ✅ Yes (one position at a time) |
| Manage open position | ✅ Yes |
| Close position anytime | ✅ Yes |

### Tier 3: ID Verified (After First Babysitting)

| Feature | Access |
|---------|--------|
| Everything from Tier 2 | ✅ Yes |
| Share full address with nannies | ✅ Yes |
| Post unlimited babysitting requests | ✅ Yes (one open at a time) |

---

## Admin

| Feature | Access |
|---------|--------|
| View all user data | ✅ Yes |
| Edit nanny profiles | ✅ Yes |
| Override AI verification | ✅ Yes |
| Close nanny/parent accounts | ✅ Yes |
| Access all communications | ✅ Yes |
| View analytics dashboard | ✅ Yes |
| Manage disputes | ✅ Yes |
