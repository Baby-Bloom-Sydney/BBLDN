> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# WWCC Verification Prompt

> AI prompt for reading Working With Children Check cards.

## Purpose

Extract WWCC number and details from card photos to assist verification.

---

## System Prompt

```
You are a document reading assistant for a nanny platform in NSW, Australia.
Your task is to extract information from Working With Children Check (WWCC)
card images.

NSW WWCC cards contain:
- WWCC Number (format: WWCxxxxxxx)
- Full name
- Card type (Paid/Volunteer)
- Date of birth
- Expiry date

Important:
- Only extract what is clearly visible
- The WWCC number is the most critical field
- Flag any cards that appear damaged or unclear
- This is to ASSIST human verification, not replace it

Output format: JSON
```

---

## User Prompt Template

```
Please analyze this Working With Children Check (WWCC) card image and extract:

1. WWCC Number
2. Full name on card
3. Card type (Paid or Volunteer)
4. Expiry date (if visible)

Assess:
- Is the card clearly readable?
- Does the WWCC number format look valid (WWCxxxxxxx)?
- Is there any damage or obstruction on the card?

Return the results in JSON format.
```

---

## Expected Output Format

```json
{
  "extracted_data": {
    "wwcc_number": "WWC1234567P",
    "full_name": "JANE ELIZABETH DOE",
    "card_type": "paid",
    "expiry_date": "2028-06-15"
  },
  "assessment": {
    "is_readable": true,
    "valid_number_format": true,
    "confidence_score": 92
  },
  "flags": [],
  "notes": "Card clearly visible. Number format matches NSW standard."
}
```

---

## WWCC Number Format

### NSW Format
- Prefix: WWC
- 7 digits
- Suffix: P (Paid) or V (Volunteer)
- Example: WWC1234567P

### Validation Regex
```typescript
const wwccRegex = /^WWC\d{7}[PV]$/i;

function isValidWWCCFormat(number: string): boolean {
  return wwccRegex.test(number.toUpperCase());
}
```

---

## Card Type Requirements

| Card Type | Acceptable for Platform? |
|-----------|--------------------------|
| Paid (P) | ✅ Yes |
| Volunteer (V) | ❌ No - requires Paid WWCC |

If Volunteer card detected:
```json
{
  "flags": ["VOLUNTEER_CARD"],
  "notes": "This is a Volunteer WWCC. A Paid WWCC is required for nanny work."
}
```

---

## Verification Flow

```
1. Nanny uploads WWCC card photo
        ↓
2. AI extracts WWCC number
        ↓
3. System validates format
        ↓
4. Admin manually verifies via NSW portal
   (https://wwccheck.ccyp.nsw.gov.au/)
        ↓
5. Verification recorded
```

---

## Manual Verification Steps

Admin must:
1. Go to NSW WWCC Check portal
2. Enter extracted WWCC number
3. Enter nanny's date of birth
4. Verify:
   - Status = "Cleared"
   - Type = "Paid"
   - Not expired
5. Screenshot for records

---

## Error Handling

| Issue | Response |
|-------|----------|
| Card not visible | "Please upload a clearer photo of your WWCC card" |
| Number not readable | "We couldn't read the WWCC number. Please try again" |
| Volunteer card | "A Paid WWCC is required. Volunteer cards cannot be accepted" |
| Expired card | "Your WWCC appears to be expired. Please renew before continuing" |

---

## Data Storage

### What to Store
- WWCC number (encrypted)
- Verification status
- Verification date
- Expiry date
- Verified by (admin ID)

### What NOT to Store Long-term
- Card image (delete after verification)
- Full extracted text

---

## Expiry Monitoring

Set up alerts for:
- 30 days before expiry
- 7 days before expiry
- On expiry date

Nanny should be prompted to renew WWCC.

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
