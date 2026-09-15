> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Search Algorithm

> How parents find and discover nannies.

## Overview

_The search and filtering system that helps parents find the right nanny._

---

## Search Interface

### Search Bar
- Free text search
- Examples: "experienced infant nanny inner west"

### Filters

| Filter | Type | Options |
|--------|------|---------|
| Location/Suburb | Dropdown + radius | Sydney suburbs, X km radius |
| Availability | Day/time picker | Days of week, time slots |
| Experience | Range slider | 0-10+ years |
| Age groups | Multi-select | Infant, Toddler, Preschool, School-age |
| Hourly rate | Range slider | $X - $Y per hour |
| Certifications | Multi-select | First Aid, CPR, WWCC, etc. |
| Languages | Multi-select | English, Mandarin, etc. |
| Special skills | Multi-select | Music, tutoring, special needs, etc. |

### Sort Options
- Relevance (default)
- Distance
- Price: Low to High
- Price: High to Low
- Rating
- Experience

---

## Search Algorithm

### Ranking Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Location match | 30% | Distance from parent's suburb |
| Availability match | 25% | Overlap with parent's needs |
| Profile completeness | 15% | More complete = higher rank |
| Verification status | 15% | Verified nannies rank higher |
| Rating & reviews | 10% | Higher ratings rank higher |
| Response rate | 5% | Active nannies rank higher |

### Scoring Formula
```
score = (location_score * 0.30) +
        (availability_score * 0.25) +
        (completeness_score * 0.15) +
        (verification_score * 0.15) +
        (rating_score * 0.10) +
        (activity_score * 0.05)
```

### Boosting Rules
| Condition | Boost |
|-----------|-------|
| WWCC verified | +10% |
| Profile photo present | +5% |
| Responded in last 24h | +5% |
| New nanny (< 30 days) | +5% (new nanny boost) |

### Filtering Rules
- Hide nannies with incomplete profiles (< X% complete)
- Hide suspended/inactive accounts
- Hide nannies outside search radius
- Hide nannies without availability overlap

---

## Technical Implementation

### Search Technology
- [ ] PostgreSQL full-text search
- [ ] Supabase pg_trgm extension
- [ ] _External search service (Algolia, Meilisearch)?_

### Database Indexes
```sql
-- Full text search index
CREATE INDEX idx_nanny_search ON nannies
USING gin(to_tsvector('english', bio || ' ' || headline));

-- Location index (PostGIS)
CREATE INDEX idx_nanny_location ON nannies
USING gist(location);
```

### API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/search/nannies` | Search with filters |
| GET | `/api/search/suggestions` | Autocomplete |

### Query Parameters
```
GET /api/search/nannies?
  q=infant+specialist&
  suburb=bondi&
  radius=10&
  min_rate=25&
  max_rate=50&
  days=mon,tue,wed&
  certifications=first_aid,wwcc&
  sort=relevance&
  page=1
```

---

## Search Results Display

### Result Card
```
[Photo] Jane S. ✅ 🪪 🏥
        ⭐ 4.9 (23 reviews)
        Bondi | 2.3 km away
        $35/hour | 5 years experience
        "Experienced infant specialist..."
        [View Profile] [Save]
```

### Results Pagination
- 20 results per page
- Infinite scroll or pagination

---

## Performance Requirements

| Metric | Target |
|--------|--------|
| Search latency | < 200ms |
| Results returned | Top 100 matches |
| Cache duration | 5 minutes |

---

## Open Questions

- [ ] _Should we use external search service?_
- [ ] _How to handle "no results" gracefully?_
- [ ] _Should location be exact or fuzzy?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
