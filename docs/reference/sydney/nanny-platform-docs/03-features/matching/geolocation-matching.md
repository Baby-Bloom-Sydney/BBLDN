> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Geolocation Matching

> Location-based matching between nannies and families.

## Overview

_How the platform uses location to connect nearby nannies with families._

---

## Location Data

### Nanny Location Data
| Field | Description | Storage |
|-------|-------------|---------|
| Primary suburb | Main work location | Text |
| Service suburbs | Areas willing to work | Array |
| Max travel distance | How far willing to travel | Number (km) |
| Coordinates | Lat/long of primary suburb | Point |

### Parent Location Data
| Field | Description | Storage |
|-------|-------------|---------|
| Suburb | Family location | Text |
| Address | Full address (private) | Text |
| Coordinates | Lat/long | Point |

---

## Matching Logic

### Distance Calculation
```
distance = haversine(nanny_coords, parent_coords)
```

### Match Criteria
A nanny matches a location if ANY of:
1. Nanny's primary suburb = Parent's suburb
2. Parent's suburb is in nanny's service suburbs
3. Distance ≤ nanny's max travel distance
4. Distance ≤ search radius specified by parent

### Scoring by Distance
| Distance | Score |
|----------|-------|
| 0-2 km | 100 |
| 2-5 km | 80 |
| 5-10 km | 60 |
| 10-15 km | 40 |
| 15-20 km | 20 |
| > 20 km | 0 (excluded) |

---

## Sydney Suburbs

### Suburb Data Source
- [ ] Australian Post suburb data
- [ ] Google Places API
- [ ] Custom curated list

### Suburb Groupings (Regions)
| Region | Example Suburbs |
|--------|-----------------|
| Eastern Suburbs | Bondi, Coogee, Randwick, Double Bay |
| Inner West | Newtown, Marrickville, Leichhardt |
| North Shore | Chatswood, Mosman, North Sydney |
| Northern Beaches | Manly, Dee Why, Mona Vale |
| South Sydney | Hurstville, Kogarah, Sutherland |
| Western Sydney | Parramatta, Blacktown, Penrith |

### Why Regions?
- Simplified search for users
- "Show me nannies in Eastern Suburbs"
- Marketing by region

---

## Technical Implementation

### Database
```sql
-- Nannies table
ALTER TABLE nannies ADD COLUMN
  location geography(Point, 4326);

-- Suburbs reference table
suburbs
- id
- name
- postcode
- region
- coordinates (Point)

-- Nanny service areas
nanny_service_areas
- nanny_id
- suburb_id
```

### PostGIS Queries
```sql
-- Find nannies within X km
SELECT * FROM nannies
WHERE ST_DWithin(
  location,
  ST_SetSRID(ST_MakePoint(lng, lat), 4326),
  radius_km * 1000
);

-- Calculate distance
SELECT ST_Distance(
  nanny.location::geography,
  parent.location::geography
) / 1000 as distance_km
FROM ...
```

### Geocoding
| Service | Use |
|---------|-----|
| Google Geocoding API | Convert addresses to coordinates |
| _Alternative?_ | |

---

## Privacy Considerations

### What's Visible
| User | Can See |
|------|---------|
| Parent (searching) | Nanny's suburb only |
| Parent (matched) | Nanny's suburb only |
| Nanny (searching) | Parent's suburb only |
| Nanny (matched) | Full address (for booking) |

### Address Handling
- Full address only shared after confirmed booking
- Address stored encrypted
- Never displayed in public search

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Nanny at boundary of service area | Include if within max distance |
| Parent address not geocodable | Fall back to suburb center |
| Nanny lists no service areas | Use primary suburb + max distance |

---

## Open Questions

- [ ] _What's the default search radius?_
- [ ] _How to handle nannies willing to travel anywhere?_
- [ ] _Should we show exact distance or ranges?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
