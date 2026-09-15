> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Profile Creation

> Nanny profile building process after signup.

## Overview

_How nannies create compelling profiles that attract parents._

---

## Profile Sections

### 1. Photo Upload
| Requirement | Details |
|-------------|---------|
| Main photo | Required, face clearly visible |
| Additional photos | Optional, up to X |
| Format | JPG, PNG |
| Size | Max X MB |
| Dimensions | Min X x Y pixels |

### 2. About Me
| Field | Type | Required | Max Length |
|-------|------|----------|------------|
| Bio/About | Textarea | ✅ | 500 chars |
| Headline | Text | ✅ | 100 chars |
| _AI-assisted?_ | | | |

### 3. Experience
| Field | Type | Required |
|-------|------|----------|
| Years of experience | Number | ✅ |
| Age groups worked with | Multi-select | ✅ |
| Experience description | Textarea | 🔶 |
| Previous roles | Structured list | 🔶 |

### 4. Skills & Qualifications
| Field | Type | Required |
|-------|------|----------|
| Certifications | Multi-select + upload | 🔶 |
| First aid certified | Checkbox | ✅ |
| CPR certified | Checkbox | 🔶 |
| Languages | Multi-select | 🔶 |
| Special skills | Tags | 🔶 |

### 5. Availability
| Field | Type | Required |
|-------|------|----------|
| Weekly schedule | Calendar grid | ✅ |
| Available immediately | Checkbox | |
| Minimum hours | Number | 🔶 |
| Maximum hours | Number | 🔶 |

### 6. Service Areas
| Field | Type | Required |
|-------|------|----------|
| Primary suburb | Dropdown | ✅ |
| Willing to travel to | Multi-select | ✅ |
| Max travel distance | Slider/Number | 🔶 |

### 7. Rates
| Field | Type | Required |
|-------|------|----------|
| Hourly rate | Currency | ✅ |
| Overnight rate | Currency | 🔶 |
| Rate negotiable | Checkbox | |

---

## Profile Completion

### Completion Scoring
| Section | Weight | Points |
|---------|--------|--------|
| Photo | 20% | |
| Bio | 15% | |
| Experience | 20% | |
| Qualifications | 15% | |
| Availability | 15% | |
| Rates | 15% | |

### Minimum for Activation
- [ ] Profile photo uploaded
- [ ] Bio completed
- [ ] At least X sections filled
- [ ] _Other requirements_

---

## AI Assistance

### AI Profile Generation
_See: `05-ai-integration/prompts/profile-generation.md`_

- [ ] Generate bio from bullet points
- [ ] Suggest headline
- [ ] Improve existing text
- [ ] _Other AI features_

---

## Technical Requirements

### API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/nanny/profile` | Fetch profile |
| PUT | `/api/nanny/profile` | Update profile |
| POST | `/api/nanny/profile/photo` | Upload photo |

### Storage
- Profile photos: _Supabase Storage_
- Certification documents: _Supabase Storage_

---

## Open Questions

- [ ] _What's the minimum profile for activation?_
- [ ] _How does AI profile generation work?_
- [ ] _Can profiles be previewed before going live?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
