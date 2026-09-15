> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# User Types & Roles

## User Roles

### 1. Public Visitors (Unauthenticated)

**Access Level**: Limited browsing only

**Can Do**:
- Browse all nanny profiles
- View: Name, photo, AI-generated bio, experience, qualifications

**Cannot Do**:
- See nanny availability calendars
- Request interviews
- Post babysitting requests
- Access any booking features

**Purpose**: Discovery and viral traffic from Facebook posts

---

### 2. Nannies (Authenticated)

**Tier 1: Profile Created (Not Verified)**
- Profile exists on platform
- Visible to public browsers
- **Cannot**: Receive interview requests or babysitting opportunities

**Tier 2: Identity Verified**
- Uploaded passport (AI verified photo matches)
- Uploaded WWCC (AI verified valid)
- **Unlocks**: Parents can request interviews
- **Still Cannot**: Access babysitting pool

**Tier 3: Fully Verified (Facebook Post Shared)**
- Completed Tiers 1 & 2
- Shared AI-generated Facebook post to groups
- Uploaded screenshot proof (AI verified)
- **Unlocks**: Full access to babysitting pool
- **Receives**: Email/SMS for babysitting opportunities

---

### 3. Parents (Authenticated)

**Tier 1: Basic Account**
- Signed up but no preference form completed
- **Can**: Browse profiles, see availability calendars
- **Cannot**: Request interviews, post babysitting requests

**Tier 2: Open Nanny Position Created**
- Completed preference form (what they want in a nanny)
- **Creates**: ONE "Open Nanny Position"
- **Unlocks**: Can request interviews with matched nannies
- **Limitation**: Only ONE position allowed at a time
- **Can Close**: At any time via website (stops all nanny-related emails)

**Tier 3: First Babysitting Request**
- Posted babysitting request
- **If first time**: Must verify ID before address shared with nanny
- **After verification**: Can post future requests without re-verification
- **Limitation**: Only ONE babysitting request open at a time (max 7 time slots per request)

---

### 4. Admin (Baby Bloom Staff)

**Access Level**: Full platform oversight

**Responsibilities**:
- Monitor new nanny signups
- Review AI verification results (can override)
- Handle edge cases in verification
- Monitor interview coordination
- Verify parent IDs for first babysitting jobs
- Quality control on profiles
- Dispute resolution
