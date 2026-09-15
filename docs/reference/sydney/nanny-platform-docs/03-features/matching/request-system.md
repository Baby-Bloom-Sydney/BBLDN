> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Request System

> How parents post care requests and nannies respond.

## Overview

_Alternative to search: parents post what they need, nannies apply._

---

## Request Types

### One-time Request
- Single booking need
- Specific date and time
- Example: "Need a nanny this Saturday 6pm-11pm"

### Recurring Request
- Ongoing care need
- Regular schedule
- Example: "Need after-school care Mon-Fri 3pm-6pm"

### Permanent Position
- Full-time or part-time role
- Long-term commitment
- Example: "Seeking full-time nanny starting March"

---

## Request Creation Flow

### Step 1: Basic Details
| Field | Type | Required |
|-------|------|----------|
| Request type | Select | ✅ |
| Title | Text | ✅ |
| Description | Textarea | ✅ |

### Step 2: Schedule
| Field | Type | Required |
|-------|------|----------|
| Date(s) | Date picker | ✅ |
| Start time | Time | ✅ |
| End time | Time | ✅ |
| Recurring pattern | Select | For recurring |

### Step 3: Requirements
| Field | Type | Required |
|-------|------|----------|
| Number of children | Number | ✅ |
| Children's ages | Multi-input | ✅ |
| Special requirements | Textarea | 🔶 |
| Required certifications | Multi-select | 🔶 |

### Step 4: Budget
| Field | Type | Required |
|-------|------|----------|
| Hourly rate offered | Currency | ✅ |
| Negotiable | Checkbox | |

### Step 5: Review & Post
- Preview request
- Confirm and post

---

## Request Visibility

### Who Sees Requests
- All verified nannies in the service area
- Nannies matching basic criteria

### Request Display
```
[Request Card]
📍 Bondi | Posted 2 hours ago

"Weekend babysitter needed"
Saturday, March 15 | 6:00 PM - 11:00 PM
2 children (3 and 5 years old)
$35/hour

[View Details] [Apply]
```

---

## Nanny Application Flow

### Step 1: View Request
- Full request details
- Family profile (limited info)

### Step 2: Apply
| Field | Type | Required |
|-------|------|----------|
| Cover message | Textarea | ✅ |
| Proposed rate | Currency | 🔶 |
| Availability confirmed | Checkbox | ✅ |

### Step 3: Confirmation
- Application submitted
- Notification to parent

---

## Parent Review Flow

### Application Management
- View all applications
- Filter by: New, Reviewed, Shortlisted, Rejected

### Application Card
```
[Nanny Photo] Jane S. ✅ 🏥
⭐ 4.9 | 5 years experience
"I'd love to help! I have extensive..."
Proposed: $35/hr

[View Profile] [Message] [Shortlist] [Reject]
```

### Actions
| Action | Result |
|--------|--------|
| Shortlist | Moves to shortlist, nanny notified |
| Reject | Hidden from view, nanny notified |
| Message | Opens conversation |
| Book | Proceed to booking flow |

---

## Request Lifecycle

```
Created → Active → [Filled / Expired / Cancelled]

States:
- Draft: Not yet posted
- Active: Accepting applications
- Paused: Temporarily hidden
- Filled: Nanny booked
- Expired: Past date, not filled
- Cancelled: Parent cancelled
```

---

## Technical Implementation

### Database Schema
```sql
care_requests
- id
- parent_id
- type (one_time, recurring, permanent)
- title
- description
- status
- location_suburb
- created_at
- expires_at

care_request_schedule
- request_id
- date
- start_time
- end_time
- recurring_pattern

care_request_applications
- id
- request_id
- nanny_id
- message
- proposed_rate
- status (pending, shortlisted, rejected, accepted)
- created_at
```

### API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/requests` | Create request |
| GET | `/api/requests` | List requests (nanny view) |
| GET | `/api/requests/:id` | Get request details |
| POST | `/api/requests/:id/apply` | Apply to request |
| GET | `/api/requests/:id/applications` | View applications (parent) |

---

## Notifications

| Event | Recipient | Channel |
|-------|-----------|---------|
| New request in area | Matching nannies | Push, Email |
| New application | Parent | Push, Email |
| Application status change | Nanny | Push, Email |
| Request expiring | Parent | Email |

---

## Open Questions

- [ ] _How long do requests stay active?_
- [ ] _Limit on applications per request?_
- [ ] _Can nannies see other applicants?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
