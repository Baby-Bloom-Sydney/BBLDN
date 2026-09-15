> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Passport Verification Prompt

> AI prompt for verifying passport/ID documents.

## Purpose

Analyze uploaded identity documents to extract information and assess authenticity.

---

## System Prompt

```
You are a document verification assistant for a nanny platform.
Your task is to analyze identity documents (passports, driver's licenses)
to extract key information and assess document validity.

Your responsibilities:
1. Extract text and data from the document image
2. Identify the document type
3. Check for obvious signs of tampering or invalidity
4. Return structured data for verification

Important:
- Be conservative in your assessments
- Flag anything suspicious for human review
- Never approve a document you're uncertain about
- Protect user privacy - only extract necessary fields

Output format: JSON
```

---

## User Prompt Template

```
Please analyze this identity document image and extract the following information:

1. Document type (passport, driver's license, other)
2. Full name as shown on document
3. Date of birth
4. Document number
5. Expiry date
6. Issuing country/state

Also assess:
- Is the document clearly readable?
- Are there any obvious signs of tampering?
- Does the document appear to be expired?
- Confidence level (0-100%)

Return the results in JSON format.
```

---

## Expected Output Format

```json
{
  "document_type": "passport",
  "extracted_data": {
    "full_name": "JANE ELIZABETH DOE",
    "date_of_birth": "1995-03-15",
    "document_number": "PA1234567",
    "expiry_date": "2028-03-14",
    "issuing_country": "Australia"
  },
  "assessment": {
    "is_readable": true,
    "tampering_detected": false,
    "is_expired": false,
    "confidence_score": 95
  },
  "flags": [],
  "recommendation": "APPROVE" | "MANUAL_REVIEW" | "REJECT",
  "notes": "Document appears valid and clearly readable."
}
```

---

## Confidence Thresholds

| Confidence | Action |
|------------|--------|
| 95-100% | Auto-approve |
| 70-94% | Flag for manual review |
| Below 70% | Request resubmission |

---

## Flags Reference

| Flag | Meaning |
|------|---------|
| `LOW_IMAGE_QUALITY` | Image blurry or partially visible |
| `POTENTIAL_TAMPERING` | Signs of digital manipulation |
| `EXPIRED_DOCUMENT` | Document past expiry date |
| `NAME_MISMATCH` | Name doesn't match profile |
| `UNRECOGNIZED_FORMAT` | Document format not recognized |
| `PARTIAL_DATA` | Some fields couldn't be extracted |

---

## Matching Logic

### Name Matching
Compare extracted name with profile name:

```typescript
function matchNames(documentName: string, profileName: string): boolean {
  // Normalize both names
  const normalize = (name: string) =>
    name.toLowerCase().replace(/[^a-z]/g, '');

  // Check for substantial match
  const docNorm = normalize(documentName);
  const profNorm = normalize(profileName);

  // Full match or contains check
  return docNorm.includes(profNorm) || profNorm.includes(docNorm);
}
```

---

## Privacy Considerations

### Data Handling
- Document images stored encrypted
- Extracted data stored securely
- Access limited to verification admins
- Retention policy: Delete after X months

### What NOT to Store
- Full document images (after verification)
- Sensitive fields not needed for verification

---

## Error Handling

| Error | Response |
|-------|----------|
| Image too small | "Please upload a larger image" |
| Not a document | "This doesn't appear to be an ID document" |
| Unsupported format | "Please upload a passport or driver's license" |
| Processing failed | "Unable to process. Please try again." |

---

## Human Review Queue

When flagged for review, admin sees:
- Original uploaded image
- AI extracted data
- AI confidence score
- Specific flags/concerns
- Side-by-side with profile data

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
