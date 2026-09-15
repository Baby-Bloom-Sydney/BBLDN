> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Badge System

> Trust and verification badges displayed on nanny profiles.

## Overview

_Visual indicators of verification status and qualifications._

---

## Badge Types

### Verification Badges

| Badge | Icon | Meaning | How Earned |
|-------|------|---------|------------|
| ID Verified | 🪪 | Identity confirmed | Passport/ID verification |
| WWCC Cleared | ✅ | Valid Working With Children Check | WWCC verification |
| First Aid | 🏥 | Current first aid certificate | Certificate upload |
| CPR Certified | ❤️ | Current CPR certificate | Certificate upload |
| Background Checked | 🔒 | Additional background check | _Third party check?_ |

### Experience Badges

| Badge | Icon | Meaning | How Earned |
|-------|------|---------|------------|
| New | 🌱 | New to platform | < 3 months |
| Experienced | ⭐ | Established on platform | > X bookings |
| Top Rated | 🏆 | Excellent reviews | > X rating, Y reviews |
| Super Nanny | 💎 | Elite status | Top X% performance |

### Specialty Badges

| Badge | Icon | Meaning | How Earned |
|-------|------|---------|------------|
| Infant Specialist | 👶 | Experience with 0-12 months | Self-declared + reviews |
| Special Needs | 💙 | Trained for special needs | Certificate/training |
| Bilingual | 🌍 | Speaks multiple languages | Self-declared |
| Night Owl | 🌙 | Available for overnights | Availability settings |

---

## Badge Display

### Profile Display
```
[Profile Photo]
Jane S. ✅ 🪪 🏥
⭐⭐⭐⭐⭐ (23 reviews)
```

### Search Results
- Show top 3 most important badges
- Verification badges take priority
- Expandable to see all

### Badge Detail
_On hover/click:_
- Badge name
- What it means
- When earned/verified
- Expiry date (if applicable)

---

## Badge Lifecycle

### Earning Badges
| Trigger | Badge Granted |
|---------|---------------|
| Passport verified | ID Verified |
| WWCC verified | WWCC Cleared |
| Certificate uploaded & approved | First Aid / CPR |
| 10 completed bookings | Experienced |
| 4.8+ rating with 20+ reviews | Top Rated |

### Losing Badges
| Trigger | Badge Removed |
|---------|---------------|
| WWCC expires | WWCC Cleared |
| Certificate expires | First Aid / CPR |
| Rating drops below threshold | Top Rated |
| Account suspended | All badges |

---

## Technical Implementation

### Database Schema
```sql
badges
- id
- name
- slug
- icon
- description
- category (verification, experience, specialty)
- is_expirable

nanny_badges
- id
- nanny_id
- badge_id
- earned_at
- expires_at
- status (active, expired, revoked)
- evidence_type
- evidence_id
```

### API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/nanny/:id/badges` | Get nanny's badges |
| POST | `/api/admin/badges/grant` | Grant badge |
| POST | `/api/admin/badges/revoke` | Revoke badge |

---

## Display Priority

When space is limited, show badges in this order:
1. WWCC Cleared (trust/safety)
2. ID Verified (trust/safety)
3. First Aid (safety)
4. Top Rated (quality)
5. Experience badges
6. Specialty badges

---

## Open Questions

- [ ] _What badges are required vs optional?_
- [ ] _How are specialty badges verified?_
- [ ] _Should badges affect search ranking?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
