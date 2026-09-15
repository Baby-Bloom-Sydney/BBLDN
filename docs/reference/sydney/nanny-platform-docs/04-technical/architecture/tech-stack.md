> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Tech Stack

> Technologies used to build Baby Bloom Sydney.

## Overview

_Complete technology stack with rationale for each choice._

---

## Stack Summary

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend Framework | Next.js | 14.x |
| UI Library | React | 18.x |
| Styling | Tailwind CSS | 3.x |
| Language | TypeScript | 5.x |
| Database | PostgreSQL (Supabase) | 15.x |
| Auth | Supabase Auth | - |
| Storage | Supabase Storage | - |
| Hosting | Vercel | - |
| Payments | Stripe | - |
| Email | Resend | - |
| SMS | Twilio | - |
| AI | Claude API | - |

---

## Frontend

### Next.js 14
**Why:** Modern React framework with excellent DX

| Feature | Use |
|---------|-----|
| App Router | File-based routing |
| Server Components | Performance, SEO |
| API Routes | Backend endpoints |
| Middleware | Auth, redirects |

### React 18
**Why:** Industry standard, huge ecosystem

| Feature | Use |
|---------|-----|
| Hooks | State management |
| Suspense | Loading states |
| Server Components | With Next.js |

### Tailwind CSS
**Why:** Rapid UI development, consistent design

| Feature | Use |
|---------|-----|
| Utility classes | Styling |
| Responsive prefixes | Mobile-first |
| Dark mode | _Future consideration_ |

### UI Components
| Option | Consideration |
|--------|---------------|
| shadcn/ui | Modern, customizable |
| Radix UI | Accessible primitives |
| Headless UI | Unstyled, accessible |

---

## Backend

### Next.js API Routes
**Why:** Unified codebase, serverless

| Use | Example |
|-----|---------|
| REST endpoints | `/api/nannies/search` |
| Webhooks | `/api/webhooks/stripe` |
| Auth callbacks | `/api/auth/callback` |

### Supabase Edge Functions
**Why:** Complex serverless logic

| Use | Example |
|-----|---------|
| Background jobs | Email sending |
| Scheduled tasks | Reminder notifications |
| Heavy processing | AI calls |

---

## Database

### PostgreSQL (Supabase)
**Why:** Reliable, feature-rich, excellent Supabase integration

| Feature | Use |
|---------|-----|
| JSONB | Flexible data |
| PostGIS | Geolocation |
| Full-text search | Nanny search |
| Row Level Security | Access control |

### Key Extensions
```sql
-- Enabled extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- UUID generation
CREATE EXTENSION IF NOT EXISTS "postgis";     -- Geolocation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Fuzzy search
```

---

## Authentication

### Supabase Auth
**Why:** Built-in, secure, easy to implement

| Feature | Use |
|---------|-----|
| Email/Password | Primary auth |
| Magic links | Passwordless option |
| Social providers | Google, Facebook |
| JWT tokens | API authentication |

---

## File Storage

### Supabase Storage
**Why:** Integrated with database, S3-compatible

| Bucket | Purpose |
|--------|---------|
| avatars | Profile photos |
| documents | Verification documents |
| certificates | Certification files |

---

## External Services

### Stripe
**Why:** Industry standard, AU support

| Feature | Use |
|---------|-----|
| Payments | Parent payments |
| Connect | Nanny payouts |
| Subscriptions | _If needed_ |

### Resend
**Why:** Modern email API, React templates

| Feature | Use |
|---------|-----|
| Transactional | Confirmations, notifications |
| React Email | Template components |

### Twilio
**Why:** Reliable SMS

| Feature | Use |
|---------|-----|
| SMS | Booking alerts |
| Verify | Phone verification |

### Claude API
**Why:** Advanced AI capabilities

| Feature | Use |
|---------|-----|
| Text generation | Profile writing |
| Document analysis | Verification |
| Conversation | _Future chatbot_ |

---

## Development Tools

| Tool | Purpose |
|------|---------|
| VS Code | IDE |
| ESLint | Code linting |
| Prettier | Code formatting |
| TypeScript | Type safety |
| pnpm | Package management |

---

## Testing

| Tool | Type |
|------|------|
| Jest | Unit tests |
| React Testing Library | Component tests |
| Playwright | E2E tests |

---

## Monitoring (To Implement)

| Tool | Purpose |
|------|---------|
| Vercel Analytics | Traffic, performance |
| Sentry | Error tracking |
| _LogRocket?_ | Session replay |

---

## Open Questions

- [ ] _shadcn/ui vs other component library?_
- [ ] _Additional monitoring tools?_
- [ ] _State management library needed?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
