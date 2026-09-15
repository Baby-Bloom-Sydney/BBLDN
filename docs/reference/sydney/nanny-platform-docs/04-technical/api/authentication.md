> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# API Authentication

> How authentication works in the Baby Bloom Sydney API.

## Overview

_Authentication strategy using Supabase Auth._

---

## Authentication Methods

### 1. Email/Password
Traditional email and password login.

```typescript
// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123',
});
```

### 2. Magic Link (Passwordless)
Email-based one-time login link.

```typescript
const { error } = await supabase.auth.signInWithOtp({
  email: 'user@example.com',
});
```

### 3. Social Login
OAuth with third-party providers.

```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google', // or 'facebook'
});
```

---

## Session Management

### JWT Tokens
Supabase Auth issues JWT tokens:

| Token | Purpose | Lifetime |
|-------|---------|----------|
| Access Token | API authentication | 1 hour |
| Refresh Token | Get new access token | 7 days |

### Token Storage
- Access token: Memory (for security)
- Refresh token: HttpOnly cookie

### Token Refresh
```typescript
// Automatic refresh in Supabase client
const { data, error } = await supabase.auth.refreshSession();
```

---

## API Request Authentication

### Bearer Token
Include access token in Authorization header:

```http
GET /api/bookings HTTP/1.1
Host: babybloomsydney.com.au
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Server-Side Verification
```typescript
// In Next.js API route
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // User is authenticated
  // user.id, user.email available
}
```

---

## Authorization (Permissions)

### Role-Based Access
```typescript
// Middleware to check role
async function requireRole(role: 'nanny' | 'parent' | 'admin') {
  const user = await getUser();

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile.role !== role) {
    throw new ForbiddenError();
  }
}
```

### Resource-Based Access
```typescript
// Only allow access to own resources
async function requireOwnership(resourceUserId: string) {
  const user = await getUser();

  if (user.id !== resourceUserId) {
    throw new ForbiddenError();
  }
}
```

---

## Row Level Security (RLS)

### Supabase RLS Policies

```sql
-- Users can only read their own data
CREATE POLICY "Users can view own profile"
ON users FOR SELECT
USING (auth.uid() = id);

-- Users can only update their own data
CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
USING (auth.uid() = id);

-- Nannies can read active nanny profiles
CREATE POLICY "Public can view active nannies"
ON nannies FOR SELECT
USING (status = 'active');

-- Only authenticated users can create bookings
CREATE POLICY "Authenticated users can create bookings"
ON bookings FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
```

---

## Protected Routes (Frontend)

### Middleware
```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();

  // Protect dashboard routes
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return res;
}
```

---

## Password Security

### Requirements
- Minimum 8 characters
- _Additional requirements?_

### Password Reset Flow
```
1. User requests reset → POST /api/auth/forgot-password
2. Email sent with reset link
3. User clicks link → /reset-password?token=xxx
4. User submits new password → POST /api/auth/reset-password
5. Password updated, user logged in
```

---

## Security Best Practices

### Implemented
- [ ] HTTPS only
- [ ] HttpOnly cookies for refresh tokens
- [ ] CSRF protection
- [ ] Rate limiting on auth endpoints
- [ ] Account lockout after failed attempts

### Headers
```typescript
// Security headers in next.config.js
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];
```

---

## Error Handling

| Error | HTTP Code | Message |
|-------|-----------|---------|
| No token provided | 401 | "Authentication required" |
| Invalid token | 401 | "Invalid or expired token" |
| Insufficient permissions | 403 | "Access denied" |
| Account suspended | 403 | "Account suspended" |

---

## Open Questions

- [ ] _Session timeout duration?_
- [ ] _Multi-device session handling?_
- [ ] _2FA implementation?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
