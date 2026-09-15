> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Verification Flow — As Built

> Complete end-to-end nanny verification pipeline as implemented. Covers passport identity verification, WWCC document verification, OCG employer portal confirmation, and the automated email webhook.

## Overview

_Nannies progress through a multi-stage verification pipeline that combines AI automation, admin review, and government portal confirmation. Two parallel data systems track progress: **verification_level** (access control) and **verification_status** (pipeline position)._

---

## Two-System Architecture

### System 1: Verification Level (Access Control)

Stored on `nannies` table as `verification_level` INTEGER.

| Level | Name | Access Granted |
|-------|------|----------------|
| 0 | Signed Up | Auth only |
| 1 | Registered | Profile visible publicly |
| 2 | ID Verified | Visible in matchmaking |
| 3 | Provisionally Verified | Receive interview requests |
| 4 | Fully Verified | Interview requests + babysitting job notifications |

### System 2: Verification Status (Pipeline Position)

Stored on `verifications` table as `verification_status` INTEGER.

| Status | Name | Stage |
|--------|------|-------|
| 0 | Not Started | — |
| 10 | Pending ID Auto | Identity |
| 11 | Pending ID Review | Identity |
| 12 | ID Rejected | Identity |
| 20 | Pending WWCC Auto | WWCC |
| 21 | Pending WWCC Review | WWCC |
| 22 | WWCC Rejected | WWCC |
| 23 | WWCC Expired | WWCC |
| 24 | WWCC Document Failed | WWCC |
| 30 | Provisionally Verified | Complete |
| 40 | Fully Verified | Complete |

---

## Pipeline Stages

### Stage 1: Passport Upload & AI Verification

**Trigger:** Nanny navigates to `/nanny/verify` and uploads passport photo + selfie.

**Process:**
```
Nanny uploads passport + selfie
        ↓
Status → 10 (Pending ID Auto)
        ↓
AI (GPT-4o vision) processes both images:
  - Extracts: surname, given names, DOB, nationality, passport number, expiry
  - Compares extracted data to profile (name, DOB)
  - Checks passport not expired
  - Compares selfie face to passport photo
        ↓
AI returns: pass/fail + confidence + reasoning + issues list
        ↓
┌─ AI passes ────→ Status → 20 (Pending WWCC Auto), Level → 2
│                  Auto-advances to WWCC stage
│
└─ AI fails ─────→ Status → 11 (Pending ID Review)
                   Queued for admin manual review
```

**AI Extraction Fields** (stored on `verifications` table):
- `extracted_surname`, `extracted_given_names`, `extracted_dob`
- `extracted_nationality`, `extracted_passport_number`, `extracted_passport_expiry`
- `identity_ai_reasoning`, `identity_ai_issues`

**Admin Manual Review** (status 11):
- Admin sees passport + selfie side-by-side in ID Check Modal
- Admin sees AI extraction + reasoning
- Options: Approve (→ status 20, level 2) or Reject with reason (→ status 12, level 1)

**Rejection** (status 12):
- Nanny sees rejection reason on `/nanny/verification`
- "Resubmit Passport" button links back to `/nanny/verify`
- Nanny can resubmit — pipeline restarts from status 10

---

### Stage 2: WWCC Upload & AI Verification

**Trigger:** Identity verified (status reaches 20). Nanny uploads WWCC PDF or enters details manually.

**Two Submission Methods:**

#### Method A: PDF Upload
```
Nanny uploads WWCC PDF
        ↓
Status → 20 (Pending WWCC Auto)
        ↓
PDF parser extracts text, checks 9 authenticity markers:
  - "Service NSW" header text
  - "Working With Children Check" title
  - Sender email (Service.NSW@service.nsw.gov.au)
  - Grant text ("has been granted")
  - Valid WWCC number format (WWCnnnnnnnE)
  - Expiry date present and not expired
  - Full name present
  - Date of birth present
  - Clearance type present
        ↓
AI (GPT-4o) cross-checks extracted data against profile:
  - Name match (surname + given names)
  - DOB match
  - WWCC number format valid
  - Expiry date in future
        ↓
┌─ All checks pass ──→ Status → 30 (Provisionally Verified), Level → 3
│                       Nanny can now receive interview requests
│
├─ Checks fail ──────→ Status → 21 (Pending WWCC Review)
│                       Queued for admin manual review
│
└─ PDF unreadable ───→ Status → 24 (WWCC Document Failed)
                       Nanny prompted to resubmit or enter manually
```

#### Method B: Manual Entry
```
Nanny enters WWCC number + full name + DOB manually
        ↓
Status → 21 (Pending WWCC Review)
        ↓
Admin verifies on OCG employer portal (see Stage 3)
```

**Admin Manual Review** (status 21):
- Admin sees WWCC number, name, DOB in Verification tab
- "Copy to clipboard" button for WWCC number
- Link to OCG employer portal
- Options: Confirm (→ status 30, level 3) or Reject with reason (→ status 22, level 2)

**Rejection** (status 22):
- Nanny sees rejection reason on `/nanny/verification`
- "Resubmit WWCC" button links back to `/nanny/verify`

**Expiry** (status 23):
- WWCC expiry date is checked
- If expired, nanny prompted to renew and resubmit

---

### Stage 3: OCG Employer Portal Verification

**Trigger:** Nanny reaches status 30 (Provisionally Verified) or status 21 (Pending WWCC Review).

**Manual Admin Step:**
1. Admin copies WWCC number from admin dashboard
2. Admin logs into OCG employer portal: `https://wwccemployer.ocg.nsw.gov.au`
3. Admin submits WWCC number for verification
4. OCG processes and sends results via email (1-3 business days)

**While waiting:** Nanny is at status 30 (Provisionally Verified) with level 3 — they can already receive interview requests. The OCG confirmation is a "silent" background step.

---

### Stage 4: OCG Email Webhook (Automated)

**Trigger:** OCG sends verification results email to `verification@babybloomsydney.com.au`.

**Architecture:**
```
OCG Portal
    ↓ sends email
Google Workspace (verification@babybloomsydney.com.au)
    ↓ Gmail filter auto-forwards
Make.com email hook
    ↓ extracts HTML
HTTP POST to /api/webhooks/ocg-verification
    ↓ parses HTML, matches WWCC number, updates DB
Status → 40 (Fully Verified) or 22 (Rejected)
```

**OCG Email Format:**
- From: `WWCCNotification@ocg.nsw.gov.au`
- Subject: `Working With Children Check Verification Results Receipt`
- HTML body contains two `<tbody>` sections:
  - First: Employer info (ID, Name, Verification Date/Time)
  - Second: Results table (Family Name, Reference Number, Result Status, Expiry Date, Result text)
- Can contain multiple result rows (batch verifications)

**Webhook Endpoint:** `POST /api/webhooks/ocg-verification`
- Auth: `Authorization: Bearer <OCG_WEBHOOK_SECRET>`
- Body: `multipart/form-data` with single field `html` (also accepts JSON `{ "html": "..." }`)

**Result Status Actions:**

| OCG Result Status | Action | New Status | New Level |
|-------------------|--------|------------|-----------|
| CLEARED | Verify | 40 (Fully Verified) | 4 |
| NOT FOUND | Reject | 22 (WWCC Rejected) | 2 |
| BARRED | Reject | 22 (WWCC Rejected) | 2 |
| INTERIM BAR | Reject | 22 (WWCC Rejected) | 2 |
| APPLICATION IN PROGRESS | No change | — | — |

**On CLEARED:**
- `verifications`: status → 40, `wwcc_verified` → true, `wwcc_verified_at` → now, `wwcc_expiry_date` → from email
- `nannies`: `verification_level` → 4, `wwcc_verified` → true, `identity_verified` → true, `status` → 'active'

**On REJECTED (NOT FOUND / BARRED / INTERIM BAR):**
- `verifications`: status → 22, `wwcc_rejection_reason` → OCG result text
- `nannies`: `verification_level` → 2, `wwcc_verified` → false

**WWCC number matching:** Looks up verification record where `wwcc_number` OR `extracted_wwcc_number` matches (case-insensitive), AND `verification_status` IN (30, 21).

---

## State Transition Summary

```
0 (Not Started)
│
├──→ 10 (Pending ID Auto) ──→ AI passes ──→ 20 (Pending WWCC Auto)
│                           └─ AI fails ──→ 11 (Pending ID Review)
│                                           ├─ Admin approves → 20
│                                           └─ Admin rejects → 12 (ID Rejected)
│                                                               └─ Resubmit → 10
│
├──→ 20 (Pending WWCC Auto) ──→ PDF passes ──→ 30 (Provisionally Verified)
│                              ├─ PDF fails ──→ 21 (Pending WWCC Review)
│                              └─ PDF unreadable → 24 (WWCC Document Failed)
│                                                   └─ Resubmit → 20 or 21
│
├──→ 21 (Pending WWCC Review) ──→ Admin approves → 30 (Provisionally Verified)
│                               └─ Admin rejects → 22 (WWCC Rejected)
│                                                   └─ Resubmit → 20 or 21
│
├──→ 30 (Provisionally Verified) ──→ OCG CLEARED → 40 (Fully Verified) ✅
│                                  └─ OCG REJECTED → 22 (WWCC Rejected)
│
└──→ 23 (WWCC Expired) ← triggered by expiry cron (future)
```

---

## Nanny-Facing UI (`/nanny/verification`)

Progress chain with 3 steps shown as a vertical timeline:

| Step | States Shown |
|------|-------------|
| **Verify your identity** | Pending (10), Under review (11), Failed (12), Complete (20+) |
| **Verify your WWCC** | Pending (20), Under review (21), Failed (22/23/24), Complete (30+) |
| **Verification complete** | Provisionally verified (30), Fully verified (40) |

- Status 10/20: Auto-polls `/api/verification-status` every 3 seconds for real-time updates
- Failed states show rejection reason + "Resubmit" button
- Status 30: Shows "Provisionally Verified — You can now receive interview requests"
- Status 40: Shows "Fully Verified — You can receive interview requests and babysitting job notifications"

---

## Files Implementing This Flow

| File | Purpose |
|------|---------|
| `src/lib/verification.ts` | Status/level constants, labels |
| `src/lib/verification/parse-ocg-email.ts` | OCG email HTML parser |
| `src/lib/verification/wwcc-pdf-parser.ts` | WWCC PDF text extraction + validation |
| `src/lib/actions/admin.ts` | Admin verify/reject server actions |
| `src/lib/actions/verification.ts` | Nanny-facing verification submission actions |
| `src/app/api/webhooks/ocg-verification/route.ts` | OCG email webhook endpoint |
| `src/app/api/verification-status/route.ts` | Polling endpoint for live status |
| `src/app/api/verify-passport/route.ts` | AI passport verification endpoint |
| `src/app/api/verify-wwcc/route.ts` | AI WWCC verification endpoint |
| `src/app/nanny/verify/page.tsx` | Upload UI (passport + WWCC) |
| `src/app/nanny/verification/page.tsx` | Status tracking page |
| `src/app/nanny/verification/VerificationStatusClient.tsx` | Live progress chain component |
| `src/app/admin/users/VerificationTab.tsx` | Admin review queues |
| `src/app/admin/users/IDCheckModal.tsx` | Admin passport review modal |

---

## External Dependencies

| Service | Purpose | Config |
|---------|---------|--------|
| OpenAI GPT-4o | Passport AI verification, WWCC AI verification | `OPENAI_API_KEY` |
| Supabase Storage | Passport + selfie + WWCC document storage | `verification-documents` bucket |
| OCG Employer Portal | Official WWCC verification | Manual admin step |
| Make.com | Email hook — forwards OCG emails to webhook | Email hook → HTTP POST |
| Google Workspace | Receives OCG emails at `verification@babybloomsydney.com.au` | Gmail filter auto-forwards to Make.com |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OCG_WEBHOOK_SECRET` | Bearer token for OCG webhook authentication |
| `OPENAI_API_KEY` | AI verification (passport + WWCC) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client for webhook DB writes |

---

**Last Updated:** 2026-02-23
**Status:** 🟢 Complete (end-to-end flow working, deployed to Vercel)
