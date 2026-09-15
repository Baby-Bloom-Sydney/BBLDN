> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Passport Verification

> Identity verification using passport or government ID.

## Overview

_Process for verifying nanny identity through official documents._

---

## Verification Flow

### Step 1: Document Upload
| Requirement | Details |
|-------------|---------|
| Document types | Australian passport, driver's license, international passport |
| Photo quality | Clear, all corners visible |
| File format | JPG, PNG, PDF |
| Max file size | X MB |

### Step 2: AI Pre-screening
```
1. Document received
        ↓
2. AI extracts text (OCR)
        ↓
3. AI validates document authenticity
        ↓
4. AI extracts key fields
        ↓
5. AI confidence score generated
        ↓
6. Route to manual review or auto-approve
```

### Step 3: Manual Review (if needed)
- [ ] Admin reviews document
- [ ] Compares to profile information
- [ ] Approves or requests resubmission

### Step 4: Outcome
| Result | Action |
|--------|--------|
| Approved | Badge granted, notification sent |
| Rejected | Reason provided, can resubmit |
| More info needed | Specific request sent |

---

## AI Verification Details

_Full prompt in: `05-ai-integration/prompts/passport-verification.md`_

### Checks Performed
- [ ] Document is a valid ID type
- [ ] Document is not expired
- [ ] Name matches profile
- [ ] Photo matches uploaded profile photo (optional)
- [ ] No signs of tampering

### Extracted Fields
| Field | Use |
|-------|-----|
| Full name | Match to profile |
| Date of birth | Age verification |
| Document number | Record keeping |
| Expiry date | Validity check |
| Issuing country | Record |

### Confidence Scoring
| Score | Action |
|-------|--------|
| > 95% | Auto-approve |
| 70-95% | Manual review |
| < 70% | Reject, request resubmission |

---

## Technical Implementation

### API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/verification/passport/upload` | Submit document |
| GET | `/api/verification/passport/status` | Check status |
| POST | `/api/admin/verification/passport/review` | Admin review |

### Storage
- Documents stored in: _Secure Supabase Storage bucket_
- Retention policy: _X months after verification_
- Encryption: _At rest and in transit_

### Database
```sql
verification_documents
- id
- nanny_id
- document_type
- file_path
- status (pending, approved, rejected)
- ai_confidence
- ai_extracted_data (JSON)
- reviewed_by
- reviewed_at
- created_at
```

---

## Security & Compliance

### Data Protection
- [ ] Encrypted storage
- [ ] Limited access (admin only)
- [ ] Audit logging
- [ ] Retention policy

### Compliance
- [ ] Australian Privacy Principles
- [ ] _Other regulations?_

---

## User Experience

### Nanny View
- Clear upload instructions
- Real-time upload progress
- Status tracking
- Estimated review time

### Admin View
- Queue of pending reviews
- Side-by-side document/profile view
- Quick approve/reject actions
- Notes field

---

## Open Questions

- [ ] _What's the auto-approve threshold?_
- [ ] _How long to retain documents?_
- [ ] _What happens if verification expires?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
