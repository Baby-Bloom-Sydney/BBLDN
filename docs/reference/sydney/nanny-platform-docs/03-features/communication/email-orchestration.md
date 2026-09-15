> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Email Orchestration

> Automated and transactional email system.

## Overview

_All platform emails: transactional, marketing, and AI-coordinated._

---

## Email Categories

### Transactional Emails
_Triggered by user actions_

| Email | Trigger | Priority |
|-------|---------|----------|
| Welcome email | User signup | Immediate |
| Email verification | Signup | Immediate |
| Password reset | Request | Immediate |
| Booking confirmation | Booking created | Immediate |
| Booking reminder | 24h before booking | Scheduled |
| Payment receipt | Payment processed | Immediate |

### Notification Emails
_Platform updates_

| Email | Trigger | Priority |
|-------|---------|----------|
| New message | Message received | Near-immediate |
| New application | Nanny applies | Near-immediate |
| Profile approved | Verification complete | Immediate |
| Review received | Review submitted | Near-immediate |

### Lifecycle Emails
_Engagement and retention_

| Email | Trigger | Priority |
|-------|---------|----------|
| Complete your profile | Profile < 80% after 3 days | Scheduled |
| We miss you | No login in 14 days | Scheduled |
| WWCC expiring | 30 days before expiry | Scheduled |

### AI-Coordinated Emails
_See: Interview coordination_

| Email | Purpose |
|-------|---------|
| Interview request | AI sends on behalf of parent |
| Interview confirmation | AI confirms schedule |
| Interview reminder | AI sends reminders |

---

## Email Templates

### Template Structure
```
Subject: [Subject line with {{variables}}]
Preheader: [Preview text]

[Header with logo]

Hi {{first_name}},

[Body content with {{variables}}]

[CTA Button]

[Footer with unsubscribe]
```

### Template Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `{{first_name}}` | User's first name | "Jane" |
| `{{nanny_name}}` | Nanny's name | "Sarah M." |
| `{{booking_date}}` | Booking date | "Saturday, March 15" |
| `{{booking_time}}` | Booking time | "6:00 PM - 11:00 PM" |
| `{{amount}}` | Payment amount | "$175.00" |

---

## Email Service

### Provider Options
| Provider | Pros | Cons |
|----------|------|------|
| Resend | Developer-friendly, React templates | |
| SendGrid | Established, good deliverability | |
| Postmark | Excellent deliverability | |
| AWS SES | Cheap, scalable | More setup |

### Implementation
```typescript
// Example with Resend
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'Baby Bloom <noreply@babybloomsydney.com.au>',
  to: user.email,
  subject: 'Welcome to Baby Bloom!',
  react: WelcomeEmail({ firstName: user.first_name }),
});
```

---

## Email Queue System

### Why Queue?
- Handle high volume
- Retry failed sends
- Rate limiting
- Scheduled sends

### Queue Structure
```sql
email_queue
- id
- template_id
- recipient_email
- variables (JSON)
- status (pending, sent, failed)
- scheduled_for
- sent_at
- attempts
- error_message
- created_at
```

### Processing
- Worker picks up pending emails
- Sends via email provider
- Updates status
- Retries on failure (max 3 attempts)

---

## Deliverability

### Best Practices
- [ ] SPF, DKIM, DMARC configured
- [ ] Dedicated sending domain
- [ ] Warm up new domain
- [ ] Monitor bounce rates
- [ ] Easy unsubscribe

### Sender Details
| Field | Value |
|-------|-------|
| From name | Baby Bloom Sydney |
| From email | noreply@babybloomsydney.com.au |
| Reply-to | support@babybloomsydney.com.au |

---

## Analytics

### Metrics to Track
| Metric | Target |
|--------|--------|
| Delivery rate | > 98% |
| Open rate | > 30% |
| Click rate | > 5% |
| Bounce rate | < 2% |
| Spam complaints | < 0.1% |

---

## Open Questions

- [ ] _Which email provider?_
- [ ] _Email template design?_
- [ ] _Frequency caps for marketing emails?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
