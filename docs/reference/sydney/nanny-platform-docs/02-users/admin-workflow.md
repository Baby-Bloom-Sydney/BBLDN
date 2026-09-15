> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

> **[DEPRECATED SYSTEM REFERENCE]** This document references the old Tier 1-2-3 verification system (Signed Up → ID Verified → Facebook Share) which has been **fully deprecated**. The current system uses numeric `verification_level` (0-4) and per-section status codes. See [`OLD system/Tier1-2-3/README.md`](/Users/bai/.openclaw/workspace/bai-brain/projects/baby-bloom/website/OLD system/Tier1-2-3/README.md) for full deprecation details.

# Admin Workflow

## Daily Monitoring

### New Nanny Signups

**Frequency**: As they occur

**Process**:
1. Review new profile submissions
2. Check AI-generated bio quality
3. Verify profile photo is appropriate
4. Manual override if needed

**Possible Actions**:
- Approve profile (default if AI quality is good)
- Edit AI-generated bio if quality issues
- Flag profile for review if suspicious

---

### Verification Uploads

**Passport Verification**:
1. AI processes upload automatically
2. Admin reviews AI decision:
   - If AI approved: Usually correct, spot-check
   - If AI uncertain: Manual review required
   - If AI rejected: Review reason, override if incorrect

**WWCC Verification**:
1. AI processes automatically
2. Admin reviews:
   - Check expiry date
   - Verify name matches
   - Confirm status is valid
3. Override if AI missed edge cases

**Facebook Post Verification**:
1. AI checks screenshot validity
2. Admin spot-checks:
   - Is post actually in a Facebook group?
   - Is link to Baby Bloom profile present?
   - Is content appropriate?
3. Approve or reject

---

### Interview Coordination

**What AI Handles**:
- Send interview request to nanny
- Receive nanny's time selection
- Confirm with parent
- Send calendar invites

**Admin Involvement**:
- Monitor for failures (email bounces, no response)
- Handle edge cases (scheduling conflicts, time zone errors)
- Respond to user questions about process

**Metrics to Track**:
- Interview request → acceptance rate
- Time to schedule interview
- Interview → hire conversion rate

---

### Babysitting Requests

**What AI Handles**:
- Find 20 closest nannies
- Send email/SMS notifications
- Track first acceptance
- Notify other nannies job filled

**Admin Involvement**:
- Monitor geolocation matching accuracy
- Handle disputes (two nannies claim they accepted first)
- Quality control on request details

---

### Parent ID Verification (First Babysitting Job)

**Trigger**: Parent's first babysitting acceptance

**Process**:
1. Parent uploads ID
2. Admin reviews:
   - Photo ID matches parent account name
   - ID appears valid (not expired, not fake)
   - Address on ID matches babysitting request address
3. Approve or reject

**If Approved**: Parent's address shared with nanny

**If Rejected**: Email parent requesting better photo/different ID

---

## Follow-Up Communications

### Post-Interview Follow-Up

**Timing**: 24-48 hours after scheduled interview

**AI Sends**:
- Friendly email to both parent and nanny
- "How did the interview go?"
- Parent: "Let us know if you decide to hire [Nanny Name]"
- Nanny: "Let us know if you got the job with [Parent Name]"

**Admin Reviews**:
- Responses indicating successful hire → track conversion
- Responses indicating issues → follow up if needed

---

### Open Position Management

**Timing**: After extended period without activity (e.g., 30+ days)

**AI Sends**:
- Email to parent: "Are you still looking for a nanny?"
- Options:
  - "Yes, still searching" (keep position open)
  - "No, position filled" (close position automatically)
  - No response → auto-close after X days

**Admin**:
- Monitor auto-close triggers
- Override if needed

---

## Quality Control

### Profile Quality:
- Spot-check AI-generated bios for:
  - Grammar/spelling
  - Professional tone
  - Accuracy to nanny's form data
- Edit if AI produces subpar content

### Verification Accuracy:
- Randomly audit AI verification decisions
- Track false positive/negative rates
- Adjust AI thresholds if needed

### Matching Quality:
- Monitor nanny/parent feedback
- Check if algorithmic matches are relevant
- Tune matching algorithm based on outcomes

---

## Dispute Resolution

**Common Disputes**:
- Two nannies claim they accepted babysitting job first
- Parent claims nanny didn't show up
- Nanny claims parent address was incorrect
- Verification rejected but user claims it's valid

**Admin Process**:
1. Review system logs/timestamps
2. Contact both parties for their side
3. Make fair decision based on evidence
4. Document resolution for future reference

---

## Metrics Dashboard (Future)

**Key Metrics to Track**:
- New nanny signups per week
- Verification completion rate (% who finish all 3 tiers)
- Interview requests sent vs accepted
- Interview → hire conversion rate
- Babysitting requests posted vs filled
- Parent signup → Open Position creation rate
- Facebook post share rate (nannies)
- Platform virality (traffic from FB posts)

**Admin Uses**:
- Identify bottlenecks in user journeys
- Optimize AI processes
- Improve conversion rates
- Scale operations efficiently
