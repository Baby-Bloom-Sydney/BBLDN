> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Security Rules

> Business rules for platform security and user safety.

## Overview

_Rules to ensure user safety and platform security._

---

## Account Security

### Password Requirements
| Requirement | Rule |
|-------------|------|
| Minimum length | 8 characters |
| Complexity | _TBD: require special chars?_ |
| Reuse | Cannot reuse last 5 passwords |
| Expiry | No forced expiry |

### Account Lockout
| Trigger | Action |
|---------|--------|
| 5 failed login attempts | Lock for 15 minutes |
| 10 failed attempts | Lock for 1 hour |
| 20 failed attempts | Lock until manual unlock |

### Session Management
| Rule | Value |
|------|-------|
| Session timeout (inactive) | 7 days |
| Session timeout (active) | 30 days |
| Maximum concurrent sessions | Unlimited |

---

## Data Privacy

### Personal Data Handling
| Data Type | Who Can See | Stored Encrypted? |
|-----------|-------------|-------------------|
| Email | Owner, Admin | ✅ |
| Phone | Owner, Admin, Matched users | ✅ |
| Address | Owner, Admin, Confirmed bookings | ✅ |
| DOB | Owner, Admin | ✅ |
| WWCC Number | Owner, Admin | ✅ |
| Payment info | Stripe only | N/A (not stored) |

### Data Retention
| Data Type | Retention Period |
|-----------|------------------|
| Active user data | While account active |
| Deleted account data | 30 days, then purged |
| Booking history | 7 years (legal requirement) |
| Messages | 2 years after last message |
| Verification documents | 90 days after verification |

### Data Access Requests
- Users can request their data (GDPR-style)
- Users can request deletion (with exceptions)
- Turnaround time: 30 days

---

## Contact Protection

### Pre-Booking Contact Rules
| Rule | Purpose |
|------|---------|
| No external contact info in messages | Prevent off-platform arrangements |
| No links in initial messages | Prevent phishing |
| Phone numbers masked | Privacy protection |

### Contact Info Sharing
| Stage | Contact Info Visible |
|-------|---------------------|
| Search | First name, suburb only |
| Matched/Interview | First name, messages |
| Confirmed booking | Full name, phone, address (as needed) |

### Off-Platform Policy
- Discourage off-platform payments
- Report suspected off-platform arrangements
- Educational messaging about platform protection

---

## Content Moderation

### Prohibited Content
| Content Type | Action |
|--------------|--------|
| Explicit/adult content | Immediate removal + suspension |
| Harassment | Warning → Suspension |
| Spam | Removal + warning |
| False information | Removal + warning |
| Discriminatory content | Warning → Suspension |

### Profile Content Rules
| Rule | Enforcement |
|------|-------------|
| Real photos only | AI + manual review |
| No contact info in bio | Automated filtering |
| Accurate qualifications | Verification required |
| Appropriate language | Automated + manual review |

### Message Monitoring
- Automated scanning for prohibited content
- Flagging for manual review
- User reporting mechanism

---

## User Safety

### Emergency Protocols
| Situation | Action |
|-----------|--------|
| Safety concern reported | Immediate investigation |
| Police involvement | Cooperate fully, suspend accounts |
| Child safety issue | Immediate suspension, report authorities |

### Red Flags
| Indicator | Action |
|-----------|--------|
| Multiple complaints | Review account |
| Suspicious activity patterns | Flag for review |
| Verification fraud attempt | Immediate ban |
| Payment fraud | Ban + report |

---

## Account Violations

### Violation Tiers
| Tier | Examples | Consequence |
|------|----------|-------------|
| Minor | Late cancellation, slow response | Warning |
| Moderate | Multiple minor violations, rude behavior | Temp suspension |
| Severe | Fraud, harassment, safety issue | Permanent ban |

### Appeal Process
1. User receives suspension notification
2. User can appeal within 14 days
3. Review by senior team member
4. Decision communicated within 7 days

---

## Platform Security

### Technical Security Measures
- [ ] HTTPS everywhere
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Rate limiting
- [ ] DDoS protection

### Admin Access
| Role | Access Level |
|------|--------------|
| Super Admin | Full access, audit logged |
| Verifier | Verification data only |
| Support | User data (read), messages |
| Developer | No production user data |

### Audit Logging
| Event | Logged? |
|-------|---------|
| Login attempts | ✅ |
| Admin actions | ✅ |
| Data access | ✅ |
| Profile changes | ✅ |
| Payment events | ✅ |

---

## Open Questions

- [ ] _2FA implementation?_
- [ ] _Background check requirements?_
- [ ] _Insurance requirements?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
