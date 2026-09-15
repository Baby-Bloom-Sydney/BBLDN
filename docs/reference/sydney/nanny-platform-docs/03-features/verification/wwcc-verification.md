> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# WWCC Verification

> Working With Children Check verification process.

## Overview

_Verifying that nannies hold a valid Working With Children Check (WWCC) for NSW._

---

## About WWCC

### What is WWCC?
- NSW government background check
- Required for anyone working with children
- Valid for 5 years
- Unique WWCC number issued

### Types
| Type | Description |
|------|-------------|
| Paid | For paid child-related work |
| Volunteer | For volunteer work only |

**Requirement:** Nannies must have a **Paid** WWCC.

---

## Verification Flow

### Step 1: Nanny Submits WWCC Details
| Field | Type | Required |
|-------|------|----------|
| WWCC Number | Text | ✅ |
| Full name (as on WWCC) | Text | ✅ |
| Date of birth | Date | ✅ |
| WWCC card photo | Image | 🔶 |

### Step 2: AI Pre-screening (Card Photo)
_If card photo submitted_
```
1. Extract WWCC number from card
        ↓
2. Verify number matches submitted
        ↓
3. Check card appears valid
        ↓
4. Route to verification
```

### Step 3: Official Verification
| Method | Description |
|--------|-------------|
| Manual | Admin checks NSW WWCC portal |
| API (future) | Automated check via government API |

### Step 4: Outcome
| Result | Action |
|--------|--------|
| Valid & Paid | Badge granted |
| Valid but Volunteer | Reject, explain requirement |
| Invalid/Not found | Reject, request correct details |
| Expired | Reject, request renewal |

---

## NSW WWCC Verification Process

### Manual Verification Steps
1. Go to [NSW WWCC Check](https://wwccheck.ccyp.nsw.gov.au/)
2. Enter nanny's WWCC number
3. Enter nanny's date of birth
4. Verify:
   - Status is "Cleared"
   - Type is "Paid"
   - Not expired
5. Screenshot for records

### Verification Portal Details
- URL: `https://wwccheck.ccyp.nsw.gov.au/`
- Requires: WWCC number + DOB
- Returns: Status, type, expiry

---

## AI Assistance

_Full prompt in: `05-ai-integration/prompts/wwcc-verification.md`_

### AI Can Help With
- [ ] OCR of WWCC card photo
- [ ] Extracting WWCC number
- [ ] Validating number format (NSW format)
- [ ] Pre-populating verification form

### AI Cannot Do
- [ ] Official verification (must check portal)
- [ ] Access government systems

---

## Technical Implementation

### Database
```sql
wwcc_verifications
- id
- nanny_id
- wwcc_number
- full_name
- date_of_birth
- status (pending, verified, rejected)
- wwcc_type (paid, volunteer)
- expiry_date
- verified_by
- verified_at
- card_image_path
- portal_screenshot_path
- created_at
```

### API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/verification/wwcc/submit` | Submit WWCC |
| GET | `/api/verification/wwcc/status` | Check status |
| POST | `/api/admin/verification/wwcc/verify` | Admin verification |

---

## Expiry Handling

### Before Expiry
- Notify nanny 30 days before
- Notify nanny 7 days before
- Notify nanny on expiry day

### On Expiry
- WWCC badge removed
- Profile marked as "Verification expired"
- Cannot accept new bookings
- Existing bookings: _[Policy needed]_

---

## Open Questions

- [ ] _Is API verification available?_
- [ ] _What happens to existing bookings when WWCC expires?_
- [ ] _Do we accept interstate WWCCs?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
