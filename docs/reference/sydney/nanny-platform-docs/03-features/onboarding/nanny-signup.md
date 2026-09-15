> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Nanny Signup

> Initial registration flow for nannies joining Baby Bloom Sydney.

## Overview

_The signup process that converts visitors into registered nannies._

---

## Signup Flow

### Step 1: Landing
**Entry point**
- Source page: _[URL]_
- Call to action: _"Become a Baby Bloom Nanny"_

### Step 2: Basic Information
| Field | Type | Required | Validation |
|-------|------|----------|------------|
| First name | Text | ✅ | |
| Last name | Text | ✅ | |
| Email | Email | ✅ | Unique, valid format |
| Phone | Phone | ✅ | Australian mobile |
| Password | Password | ✅ | Min 8 chars |
| Suburb | Dropdown/Search | ✅ | Sydney suburbs |

### Step 3: Verification
| Method | Implementation |
|--------|----------------|
| Email verification | _Link sent to email_ |
| Phone verification | _SMS code_ |

### Step 4: Terms & Conditions
- [ ] Terms of service
- [ ] Privacy policy
- [ ] Nanny agreement

### Step 5: Confirmation
- Welcome screen
- Next steps guidance
- Redirect to profile creation

---

## Technical Requirements

### API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/verify-email` | Confirm email |
| POST | `/api/auth/verify-phone` | Confirm phone |

### Database Tables
- `users` - Core user record
- `nannies` - Nanny-specific data
- `verification_tokens` - Email/phone tokens

### Integrations
- [ ] Email service (verification emails)
- [ ] SMS service (phone verification)
- [ ] _Other?_

---

## UI/UX Requirements

### Design Notes
- Mobile-first design
- Progress indicator
- Inline validation
- Clear error messages

### Screens Needed
1. Signup form
2. Email verification pending
3. Phone verification
4. Success/welcome

---

## Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| Email exists | _"This email is already registered"_ | Offer login link |
| Invalid phone | _"Please enter a valid Australian mobile"_ | |
| Weak password | _"Password must be at least 8 characters"_ | |

---

## Success Criteria

- [ ] Signup completion rate > X%
- [ ] Time to complete < X minutes
- [ ] Verification completion rate > X%

---

## Open Questions

- [ ] _Do we verify phone at signup or later?_
- [ ] _What's the password policy?_
- [ ] _Social login options (Google, Facebook)?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
