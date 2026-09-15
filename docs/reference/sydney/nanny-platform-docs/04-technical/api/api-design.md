> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# API Design

> Design principles and standards for the Baby Bloom Sydney API.

## Overview

_RESTful API design guidelines and conventions._

---

## Design Principles

### 1. RESTful Resources
- Use nouns, not verbs
- Resources represent entities

| ✅ Good | ❌ Bad |
|---------|--------|
| GET /api/nannies | GET /api/getNannies |
| POST /api/bookings | POST /api/createBooking |
| DELETE /api/users/:id | POST /api/deleteUser |

### 2. Consistent Naming
- Use lowercase
- Use hyphens for multi-word resources
- Plural nouns for collections

```
/api/nannies
/api/care-requests
/api/verification-documents
```

### 3. Proper HTTP Methods

| Method | Purpose | Idempotent |
|--------|---------|------------|
| GET | Retrieve resource(s) | Yes |
| POST | Create resource | No |
| PUT | Update resource (full) | Yes |
| PATCH | Update resource (partial) | Yes |
| DELETE | Delete resource | Yes |

### 4. Meaningful Status Codes

| Code | When to Use |
|------|-------------|
| 200 | Successful GET, PUT, PATCH |
| 201 | Successful POST (resource created) |
| 204 | Successful DELETE (no content) |
| 400 | Bad request (malformed) |
| 401 | Unauthenticated |
| 403 | Unauthorized (no permission) |
| 404 | Resource not found |
| 422 | Validation error |
| 500 | Server error |

---

## URL Structure

### Collection Endpoints
```
GET    /api/nannies          # List nannies
POST   /api/nannies          # Create nanny
```

### Resource Endpoints
```
GET    /api/nannies/:id      # Get single nanny
PUT    /api/nannies/:id      # Update nanny
DELETE /api/nannies/:id      # Delete nanny
```

### Nested Resources
```
GET    /api/parents/:id/children       # List parent's children
POST   /api/parents/:id/children       # Add child to parent
GET    /api/bookings/:id/messages      # Messages for booking
```

### Actions (when REST doesn't fit)
```
POST   /api/bookings/:id/accept        # Accept booking
POST   /api/bookings/:id/cancel        # Cancel booking
POST   /api/nannies/:id/verify         # Trigger verification
```

---

## Request/Response Format

### Request Body
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "email": "jane@example.com"
}
```

### Success Response
```json
{
  "data": {
    "id": "uuid",
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "created_at": "2024-03-15T10:00:00Z"
  }
}
```

### Collection Response
```json
{
  "data": [
    { "id": "1", "name": "..." },
    { "id": "2", "name": "..." }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "total_pages": 8
  }
}
```

### Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "email": ["Email is required", "Must be valid email"],
      "password": ["Minimum 8 characters"]
    }
  }
}
```

---

## Pagination

### Query Parameters
```
GET /api/nannies?page=2&limit=20
```

### Response Meta
```json
{
  "meta": {
    "page": 2,
    "limit": 20,
    "total": 156,
    "total_pages": 8,
    "has_next": true,
    "has_prev": true
  }
}
```

### Cursor-Based (Alternative)
```
GET /api/messages?cursor=abc123&limit=50
```

---

## Filtering & Sorting

### Filtering
```
GET /api/nannies?suburb=bondi&min_rate=25&max_rate=50
GET /api/bookings?status=confirmed&upcoming=true
```

### Sorting
```
GET /api/nannies?sort=hourly_rate&order=asc
GET /api/nannies?sort=-created_at  # Descending with prefix
```

### Multiple Sorts
```
GET /api/nannies?sort=rating:desc,hourly_rate:asc
```

---

## Field Selection

### Sparse Fieldsets
```
GET /api/nannies?fields=id,first_name,hourly_rate,suburb
```

### Includes (Related Resources)
```
GET /api/nannies/:id?include=reviews,badges
GET /api/bookings?include=nanny,parent
```

---

## Versioning

### URL Versioning (Recommended)
```
/api/v1/nannies
/api/v2/nannies
```

### Header Versioning (Alternative)
```
Accept: application/vnd.babybloom.v1+json
```

---

## Rate Limiting

### Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1609459200
```

### Limits
| Endpoint Type | Limit |
|---------------|-------|
| Public | 100/minute |
| Authenticated | 1000/minute |
| Auth endpoints | 10/minute |

---

## Validation

### Input Validation
```typescript
// Using Zod
const CreateNannySchema = z.object({
  first_name: z.string().min(1).max(100),
  email: z.string().email(),
  hourly_rate: z.number().positive().max(500),
});
```

### Validation Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "hourly_rate": ["Must be a positive number"]
    }
  }
}
```

---

## Open Questions

- [ ] _Use GraphQL for any endpoints?_
- [ ] _API documentation tool (Swagger/OpenAPI)?_
- [ ] _Caching strategy (ETags, Cache-Control)?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
