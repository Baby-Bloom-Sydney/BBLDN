> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# System Overview

> High-level architecture of the Baby Bloom Sydney platform.

## Overview

_Complete system architecture showing how all components connect._

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
├─────────────────────────────────────────────────────────────────┤
│  [Web Browser]     [Mobile Browser]     [Future: Native App]    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VERCEL (Hosting)                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Next.js Application                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │    │
│  │  │   Pages      │  │  API Routes  │  │  Middleware  │   │    │
│  │  │   (SSR/SSG)  │  │  (Backend)   │  │  (Auth)      │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE (Backend)                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │  Auth        │  │  Storage     │          │
│  │  Database    │  │  (Users)     │  │  (Files)     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │  Edge        │  │  Realtime    │                            │
│  │  Functions   │  │  (WebSocket) │                            │
│  └──────────────┘  └──────────────┘                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                              │
├─────────────────────────────────────────────────────────────────┤
│  [Stripe]  [Twilio]  [Resend]  [Claude API]  [Google Maps]      │
│  Payments   SMS      Email     AI Features   Geocoding          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### Frontend (Next.js)

| Component | Purpose |
|-----------|---------|
| Pages | Server-rendered React pages |
| Components | Reusable UI components |
| Hooks | Custom React hooks |
| Context | Global state management |

### Backend (Next.js API Routes + Supabase)

| Component | Purpose |
|-----------|---------|
| API Routes | REST endpoints |
| Edge Functions | Serverless logic |
| Middleware | Auth, rate limiting |
| Database | PostgreSQL via Supabase |

### Infrastructure

| Service | Purpose |
|---------|---------|
| Vercel | Hosting, CDN, deployments |
| Supabase | Database, auth, storage |
| Cloudflare | _Optional: Additional CDN_ |

---

## Data Flow

### User Registration
```
1. User submits signup form
2. Next.js API validates input
3. Supabase Auth creates user
4. Database trigger creates profile
5. Welcome email sent via Resend
6. User redirected to profile creation
```

### Nanny Search
```
1. Parent enters search criteria
2. Next.js API receives request
3. PostgreSQL query with PostGIS
4. Results ranked by algorithm
5. Response returned to client
6. React renders results
```

### Booking Flow
```
1. Parent selects nanny and time
2. Create pending booking in DB
3. Notify nanny (push, email)
4. Nanny accepts/declines
5. If accepted: create Stripe payment
6. Process payment
7. Confirm booking
8. Send confirmations to both parties
```

---

## Security Layers

```
┌─────────────────────────────────────────┐
│ 1. Edge (Vercel/Cloudflare)             │
│    - DDoS protection                    │
│    - Rate limiting                      │
├─────────────────────────────────────────┤
│ 2. Application (Next.js)                │
│    - Input validation                   │
│    - CSRF protection                    │
│    - Auth middleware                    │
├─────────────────────────────────────────┤
│ 3. Database (Supabase RLS)              │
│    - Row Level Security                 │
│    - Role-based access                  │
└─────────────────────────────────────────┘
```

---

## Scalability Considerations

| Concern | Solution |
|---------|----------|
| Traffic spikes | Vercel auto-scaling |
| Database load | Supabase connection pooling |
| Search performance | Database indexing, caching |
| File storage | Supabase Storage (S3-compatible) |

---

## Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local development | localhost:3000 |
| Preview | PR previews | *.vercel.app |
| Staging | Pre-production testing | staging.babybloomsydney.com.au |
| Production | Live site | babybloomsydney.com.au |

---

## Open Questions

- [ ] _Need additional caching layer?_
- [ ] _CDN for static assets?_
- [ ] _Monitoring and observability setup?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
