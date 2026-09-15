> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# Parent User Journey

## Phase 1: Discovery

### How Parents Find Baby Bloom:
- **Primary**: Facebook posts from nannies (links to their profiles)
- Word of mouth from other parents
- Google search for nannies in Sydney

### Public Browsing (No Account):
- Land on Baby Bloom website
- Browse all nanny profiles
- See: Photos, bios, experience, qualifications
- **Cannot see**: Availability calendars
- **Cannot**: Request interviews or contact nannies

**Purpose**: Viral discovery, build interest before signup

---

## Phase 2: Signup & Profile Creation

### Signup Trigger:
- Want to see nanny availability
- Want to request interview
- Want to post babysitting request

### Account Creation:
1. Click "Sign Up" or "Request Interview" (prompts signup)
2. Enter email + password
3. Basic info (name, location)

**Status**: Logged-in parent (Tier 1)

**Can Now**: See nanny availability calendars

**Still Cannot**: Request interviews (need Open Nanny Position)

---

## Path A: Finding a Regular Nanny

### Step 1: Create Open Nanny Position

**Trigger**: Parent wants to find ongoing nanny

**Process**:
1. Parent fills out detailed preference form:
   - Days/hours needed
   - Number of children, ages
   - Location (address/suburb)
   - Rate budget
   - Specific requirements:
     - Experience level needed
     - Qualifications preferred
     - Special skills (cooking, tutoring, etc.)
     - Personality traits
     - Transportation needs
     - Language requirements
2. Submit form

**Result**: Creates ONE "Open Nanny Position"

**Limitation**: Can only have ONE position open at a time

---

### Step 2: View Matched Nannies

**What Happens**:
- AI algorithm matches nannies based on:
  - Parent preferences vs nanny profile
  - Availability overlap
  - Location proximity
  - Rate alignment
  - Experience/qualifications match
- Parent sees ranked list of best matches

**Parent Can**:
- Browse matched nannies
- See full profiles
- See availability calendars
- Compare multiple candidates

---

### Step 3: Request Interview

**Process**:
1. Parent clicks "Request Interview" on nanny profile
2. Views nanny's availability calendar
3. Selects 3 preferred interview time slots
4. Adds optional message to nanny
5. Submits request

**What Happens Behind Scenes**:
- Baby Bloom AI emails nanny with 3 options
- Nanny selects preferred time
- Baby Bloom AI confirms with parent
- Calendar invites sent to both parties

---

### Step 4: Interview

**Format**: Video call (parent and nanny self-coordinate platform - Zoom, etc.)

**Baby Bloom's Role**: Facilitation only, not present in interview

**Post-Interview**:
- Parent receives friendly AI email: "How did the interview go?"
- Parent can:
  - **Hire nanny**: Close position manually on website
  - **Keep searching**: Request more interviews
  - **Close position**: If hired externally or changed mind

**Position Auto-Close**:
- If parent confirms position filled
- If extended time passes without activity (triggers AI email asking status)

---

### Step 5: Manage Position

**Parent Can**:
- Close "Open Nanny Position" anytime via website
- Closing position = unsubscribe from nanny-related emails
- Can immediately open new position after closing (no cooldown)

---

## Path B: Finding a Babysitter (One-Time)

### Step 1: Post Babysitting Request

**Requirements**:
- Must have account (logged in)
- No "Open Nanny Position" needed (separate system)

**Process**:
1. Click "Find a Babysitter"
2. Fill out request form:
   - Date(s) and time(s) needed (up to 7 time slots in ONE request)
   - Location (full address)
   - Number of children, ages
   - Rate offered
   - Special requirements/notes
3. **Current requirement**: Share AI-generated Facebook post to groups
4. **Future option**: Pay small fee to skip Facebook step

**Note**: One babysitter accepts entire request (all time slots)

**Limitation**: Only ONE babysitting request open at a time

---

### Step 2: AI-Generated Facebook Post (Current Model)

**What AI Creates**:
- Engaging post script for Facebook groups
- Details of babysitting need
- Call-to-action for nannies
- Link back to platform (optional)

**Parent Shares**:
- Post to local parenting/nanny Facebook groups
- Drives organic traffic + babysitter applications

---

### Step 3: Matching & Notification

**What Happens**:
1. AI finds 20 closest nannies (geolocation-based) who have:
   - Tier 3 verification (Facebook post verified)
   - Availability matching request
2. Sends email/SMS simultaneously to all 20 nannies
3. Email contains:
   - Date/time of job
   - Location (suburb only initially)
   - Children details
   - Rate
   - Special requirements

---

### Step 4: Nanny Acceptance (First-Come-First-Serve)

**Process**:
1. Nannies race to accept job
2. First nanny to click "Accept" wins
3. Other 19 nannies notified job is filled

---

### Step 5: Parent ID Verification (First-Time Only)

**Trigger**: Parent's first babysitting job accepted

**Process**:
1. Parent receives email: "Before we share your address, please verify ID"
2. Parent uploads photo ID (driver's license, passport)
3. Baby Bloom verifies
4. Once verified, parent's address shared with nanny

**Future Jobs**: No re-verification needed (one-time check)

---

### Step 6: Job Completion

**What Happens**:
- Nanny shows up at address
- Job completed
- (Future: Payment processing, reviews, ratings - TBD)

---

## Ongoing Parent Experience

### Active Parents with Open Nanny Position:
- Receive interview confirmations
- Can request multiple interviews simultaneously
- Receive follow-up emails about interview outcomes
- Can close/reopen positions as needed

### Active Parents with Babysitting Requests:
- Notified when nanny accepts job
- Can post new babysitting requests after previous ones filled
- Build reputation over time (future: reviews/ratings)

### Future Upsell (Out of Current Scope):
- If successfully hired nanny via Baby Bloom
- Offered free trial of educational app
- Can purchase nanny training bundle
- High conversion expected (already trust platform)
