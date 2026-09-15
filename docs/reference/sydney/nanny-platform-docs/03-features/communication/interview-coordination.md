> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Interview Coordination

> AI-assisted scheduling of parent-nanny interviews.

## Overview

_How the platform helps coordinate interviews between parents and nannies._

---

## Interview Types

| Type | Description | Where |
|------|-------------|-------|
| Video call | Virtual meeting | Zoom/Google Meet |
| Phone call | Voice only | Phone |
| In-person | Face-to-face meeting | Public location / family home |

---

## Coordination Flow

### Step 1: Parent Initiates
Parent indicates interest in interviewing a nanny
- From nanny profile: "Request Interview"
- From application: "Schedule Interview"

### Step 2: AI Gathers Availability
```
1. System checks nanny's calendar availability
        ↓
2. System checks parent's preferences
        ↓
3. AI suggests 3-5 optimal time slots
        ↓
4. Parent selects preferred times
```

### Step 3: AI Sends Request
AI composes and sends email to nanny:
- Personalized message
- Available time slots
- Interview type options
- Easy response mechanism

### Step 4: Nanny Responds
- Selects time slot
- Confirms interview type
- Adds any notes

### Step 5: Confirmation
- Both parties notified
- Calendar invites sent
- Reminders scheduled

---

## AI Email Generation

_Full prompt in: `05-ai-integration/prompts/email-coordination.md`_

### What AI Generates
- Subject line
- Personalized greeting
- Context about the family
- Time slot presentation
- Professional sign-off

### Example Generated Email
```
Subject: Interview Request from the Smith Family

Hi Sarah,

The Smith family in Bondi is interested in meeting you
for their childcare needs. They have two children
(ages 3 and 5) and are looking for regular after-school care.

They're available to meet at these times:
• Tuesday, March 12 at 10:00 AM
• Wednesday, March 13 at 2:00 PM
• Thursday, March 14 at 11:00 AM

Would any of these work for you? You can also suggest
alternative times.

Best regards,
Baby Bloom Sydney
```

---

## Calendar Integration

### Checking Availability
| Source | How |
|--------|-----|
| Nanny's platform availability | Database |
| Nanny's connected calendar | Google/Apple Calendar API |
| Parent's preferences | From request |

### Sending Invites
- Google Calendar invite
- Apple Calendar (.ics file)
- In-app calendar entry

---

## Interview Reminders

| When | Channel | Message |
|------|---------|---------|
| 24 hours before | Email + Push | "Reminder: Interview tomorrow at 10 AM" |
| 1 hour before | Push | "Your interview starts in 1 hour" |
| At time | Push | "Your interview is starting now" |

---

## Technical Implementation

### Database Schema
```sql
interviews
- id
- parent_id
- nanny_id
- type (video, phone, in_person)
- status (requested, scheduled, completed, cancelled)
- scheduled_at
- location (for in-person)
- video_link (for video)
- notes
- created_at

interview_time_slots
- id
- interview_id
- proposed_by (parent, nanny, system)
- datetime
- status (proposed, accepted, rejected)
```

### API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/interviews/request` | Request interview |
| GET | `/api/interviews/:id/slots` | Get time slots |
| POST | `/api/interviews/:id/confirm` | Confirm slot |
| POST | `/api/interviews/:id/cancel` | Cancel interview |

---

## Post-Interview

### After Interview Actions
- [ ] Parent can book nanny directly
- [ ] Parent can request another interview
- [ ] Parent can pass on nanny
- [ ] Either party can leave feedback (private)

### Follow-up
- If no action in 48h, prompt parent
- "How did your interview with Sarah go?"

---

## Open Questions

- [ ] _Should we provide video call hosting?_
- [ ] _How long should time slots be?_
- [ ] _Limit on interview requests?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
