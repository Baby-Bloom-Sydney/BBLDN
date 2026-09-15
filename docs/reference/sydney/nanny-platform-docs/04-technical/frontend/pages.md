> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Pages

> All pages/routes in the Baby Bloom Sydney application.

## Overview

_Complete page structure using Next.js App Router._

---

## Route Structure

```
app/
├── page.tsx                          # Home
├── about/page.tsx                    # About us
├── how-it-works/page.tsx             # How it works
├── pricing/page.tsx                  # Pricing
├── contact/page.tsx                  # Contact
│
├── (auth)/
│   ├── login/page.tsx                # Login
│   ├── signup/page.tsx               # Signup (role selection)
│   ├── signup/nanny/page.tsx         # Nanny signup
│   ├── signup/parent/page.tsx        # Parent signup
│   ├── forgot-password/page.tsx      # Forgot password
│   ├── reset-password/page.tsx       # Reset password
│   └── verify-email/page.tsx         # Email verification
│
├── nannies/
│   ├── page.tsx                      # Search/browse nannies
│   └── [id]/page.tsx                 # Nanny profile (public)
│
├── dashboard/
│   ├── layout.tsx                    # Dashboard layout
│   ├── page.tsx                      # Dashboard home
│   │
│   ├── (nanny)/                      # Nanny-specific pages
│   │   ├── profile/page.tsx          # Edit profile
│   │   ├── availability/page.tsx     # Set availability
│   │   ├── bookings/page.tsx         # View bookings
│   │   ├── earnings/page.tsx         # Earnings/payments
│   │   └── verification/page.tsx     # Verification status
│   │
│   ├── (parent)/                     # Parent-specific pages
│   │   ├── profile/page.tsx          # Family profile
│   │   ├── children/page.tsx         # Manage children
│   │   ├── bookings/page.tsx         # View bookings
│   │   ├── favorites/page.tsx        # Saved nannies
│   │   └── requests/page.tsx         # Care requests
│   │
│   ├── messages/page.tsx             # Conversations list
│   ├── messages/[id]/page.tsx        # Conversation thread
│   ├── settings/page.tsx             # Account settings
│   └── notifications/page.tsx        # Notification center
│
├── admin/
│   ├── layout.tsx                    # Admin layout
│   ├── page.tsx                      # Admin dashboard
│   ├── verifications/page.tsx        # Pending verifications
│   ├── users/page.tsx                # User management
│   ├── bookings/page.tsx             # All bookings
│   └── analytics/page.tsx            # Analytics
│
└── api/                              # API routes
    └── ...
```

---

## Public Pages

### Home (`/`)
| Element | Purpose |
|---------|---------|
| Hero section | Value proposition |
| Search bar | Quick nanny search |
| How it works | Process overview |
| Featured nannies | Social proof |
| Testimonials | Trust building |
| CTA | Sign up prompts |

### Search (`/nannies`)
| Element | Purpose |
|---------|---------|
| Search bar | Text search |
| Filters | Refine results |
| Results list | Nanny cards |
| Map view | _Optional_ |
| Pagination | Load more |

### Nanny Profile (`/nannies/[id]`)
| Element | Purpose |
|---------|---------|
| Photo + badges | Visual trust |
| Bio | About the nanny |
| Experience | Work history |
| Availability | When available |
| Reviews | Social proof |
| Contact CTA | Request interview |

---

## Auth Pages

### Login (`/login`)
- Email/password form
- Social login buttons
- Forgot password link
- Sign up link

### Signup (`/signup`)
- Role selection (nanny/parent)
- Redirects to role-specific signup

### Signup - Nanny (`/signup/nanny`)
- Multi-step form
- Basic info → Profile → Verification

### Signup - Parent (`/signup/parent`)
- Simpler form
- Basic info → Family details

---

## Dashboard Pages

### Nanny Dashboard (`/dashboard` - nanny view)
| Section | Content |
|---------|---------|
| Overview | Stats, upcoming bookings |
| Quick actions | Update availability, view messages |
| Alerts | Verification status, new requests |

### Parent Dashboard (`/dashboard` - parent view)
| Section | Content |
|---------|---------|
| Overview | Upcoming bookings |
| Quick actions | Find nanny, view messages |
| Recommendations | Suggested nannies |

---

## Page Access Control

| Page | Public | Nanny | Parent | Admin |
|------|--------|-------|--------|-------|
| / | ✅ | ✅ | ✅ | ✅ |
| /nannies | ✅ | ✅ | ✅ | ✅ |
| /nannies/[id] | ✅ | ✅ | ✅ | ✅ |
| /login | ✅ | ❌ | ❌ | ❌ |
| /dashboard | ❌ | ✅ | ✅ | ❌ |
| /dashboard/profile | ❌ | ✅ | ✅ | ❌ |
| /admin/* | ❌ | ❌ | ❌ | ✅ |

---

## Page Metadata

```typescript
// Example: app/nannies/page.tsx
export const metadata: Metadata = {
  title: 'Find Nannies in Sydney | Baby Bloom Sydney',
  description: 'Search and connect with verified, trusted nannies in Sydney.',
  openGraph: {
    title: 'Find Nannies in Sydney',
    description: 'Search and connect with verified, trusted nannies.',
    images: ['/og-search.jpg'],
  },
};
```

---

## Loading & Error States

### Loading
```typescript
// app/nannies/loading.tsx
export default function Loading() {
  return <NannySearchSkeleton />;
}
```

### Error
```typescript
// app/nannies/error.tsx
export default function Error({ error, reset }) {
  return <ErrorPage error={error} onRetry={reset} />;
}
```

### Not Found
```typescript
// app/nannies/[id]/not-found.tsx
export default function NotFound() {
  return <NannyNotFound />;
}
```

---

## Open Questions

- [ ] _Blog/resources section?_
- [ ] _Help center pages?_
- [ ] _Terms, privacy, FAQ pages?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
