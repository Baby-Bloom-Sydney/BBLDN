> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# API Endpoints

> Complete API reference for Baby Bloom Sydney.

## Overview

_REST API endpoints organized by resource._

---

## Base URL

| Environment | Base URL |
|-------------|----------|
| Development | `http://localhost:3000/api` |
| Staging | `https://staging.babybloomsydney.com.au/api` |
| Production | `https://babybloomsydney.com.au/api` |

---

## Authentication Endpoints

### POST /api/auth/signup
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "first_name": "Jane",
  "last_name": "Doe",
  "role": "nanny"
}
```

**Response:** `201 Created`
```json
{
  "user": { "id": "uuid", "email": "..." },
  "session": { "access_token": "...", "refresh_token": "..." }
}
```

### POST /api/auth/login
Authenticate existing user.

### POST /api/auth/logout
End user session.

### POST /api/auth/forgot-password
Request password reset.

### POST /api/auth/reset-password
Reset password with token.

---

## Nanny Endpoints

### GET /api/nannies
Search and list nannies.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| q | string | Search query |
| suburb | string | Filter by suburb |
| radius | number | Distance in km |
| min_rate | number | Minimum hourly rate |
| max_rate | number | Maximum hourly rate |
| certifications | string[] | Required certifications |
| sort | string | Sort field |
| page | number | Page number |
| limit | number | Results per page |

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "first_name": "Jane",
      "headline": "Experienced infant specialist",
      "hourly_rate": 35.00,
      "suburb": "Bondi",
      "distance_km": 2.3,
      "rating": 4.9,
      "review_count": 23,
      "badges": ["wwcc", "first_aid"]
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 156
  }
}
```

### GET /api/nannies/:id
Get full nanny profile.

### PUT /api/nannies/:id
Update nanny profile. (Auth required, own profile)

### POST /api/nannies/:id/photos
Upload profile photo.

---

## Parent Endpoints

### GET /api/parents/:id
Get parent profile. (Auth required)

### PUT /api/parents/:id
Update parent profile. (Auth required, own profile)

### GET /api/parents/:id/children
List parent's children.

### POST /api/parents/:id/children
Add a child.

---

## Booking Endpoints

### GET /api/bookings
List user's bookings. (Auth required)

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| status | string | Filter by status |
| upcoming | boolean | Future bookings only |
| past | boolean | Past bookings only |

### POST /api/bookings
Create a booking request.

**Request:**
```json
{
  "nanny_id": "uuid",
  "start_time": "2024-03-15T18:00:00Z",
  "end_time": "2024-03-15T23:00:00Z",
  "notes": "Two children, ages 3 and 5"
}
```

### GET /api/bookings/:id
Get booking details.

### PUT /api/bookings/:id
Update booking. (Status changes, notes)

### POST /api/bookings/:id/accept
Nanny accepts booking.

### POST /api/bookings/:id/decline
Nanny declines booking.

### POST /api/bookings/:id/cancel
Cancel booking.

---

## Messaging Endpoints

### GET /api/conversations
List user's conversations.

### GET /api/conversations/:id
Get conversation with messages.

### POST /api/conversations
Start new conversation.

### POST /api/conversations/:id/messages
Send a message.

---

## Verification Endpoints

### POST /api/verification/documents
Upload verification document.

### GET /api/verification/status
Get verification status.

### POST /api/verification/wwcc
Submit WWCC details.

---

## Admin Endpoints

### GET /api/admin/verifications
List pending verifications.

### POST /api/admin/verifications/:id/approve
Approve verification.

### POST /api/admin/verifications/:id/reject
Reject verification.

### GET /api/admin/users
List/search users.

### PUT /api/admin/users/:id/status
Update user status (suspend, activate).

---

## Webhook Endpoints

### POST /api/webhooks/stripe
Handle Stripe events.

### POST /api/webhooks/twilio
Handle Twilio SMS events.

---

## Response Formats

### Success Response
```json
{
  "data": { ... },
  "meta": { ... }
}
```

### Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": { ... }
  }
}
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 422 | Validation Error |
| 500 | Server Error |

---

## Open Questions

- [ ] _Pagination strategy (cursor vs offset)?_
- [ ] _Rate limiting configuration?_
- [ ] _API versioning strategy?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
