> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Routing

> Navigation and routing strategy using Next.js App Router.

## Overview

_How routing works in the Baby Bloom Sydney application._

---

## App Router Structure

### Route Groups
Using `(folder)` syntax for organization without affecting URL.

```
app/
├── (marketing)/          # Public marketing pages
│   ├── page.tsx         # / (home)
│   ├── about/
│   └── pricing/
│
├── (auth)/               # Authentication pages
│   ├── login/
│   ├── signup/
│   └── layout.tsx       # Shared auth layout
│
├── (dashboard)/          # Authenticated user pages
│   ├── dashboard/
│   └── layout.tsx       # Dashboard layout with sidebar
│
└── (admin)/              # Admin pages
    ├── admin/
    └── layout.tsx       # Admin layout
```

### Dynamic Routes
```
app/
├── nannies/
│   └── [id]/            # /nannies/abc-123
│       └── page.tsx
│
├── messages/
│   └── [conversationId]/
│       └── page.tsx
```

### Catch-All Routes
```
app/
├── [...slug]/           # Catch-all for CMS pages
│   └── page.tsx
```

---

## Route Types

### Static Routes
Pre-rendered at build time.

```typescript
// app/about/page.tsx
export default function AboutPage() {
  return <About />;
}
```

### Dynamic Routes
Rendered on request.

```typescript
// app/nannies/[id]/page.tsx
export default async function NannyPage({
  params
}: {
  params: { id: string }
}) {
  const nanny = await getNanny(params.id);
  return <NannyProfile nanny={nanny} />;
}
```

### Static Generation with Dynamic Params
```typescript
// app/nannies/[id]/page.tsx
export async function generateStaticParams() {
  const nannies = await getTopNannies();
  return nannies.map((nanny) => ({
    id: nanny.id,
  }));
}
```

---

## Navigation

### Link Component
```tsx
import Link from 'next/link';

<Link href="/nannies">Browse Nannies</Link>
<Link href={`/nannies/${nanny.id}`}>View Profile</Link>
```

### Programmatic Navigation
```typescript
import { useRouter } from 'next/navigation';

const router = useRouter();

// Navigate
router.push('/dashboard');

// Replace (no history entry)
router.replace('/login');

// Back
router.back();
```

### Navigation with Query Params
```tsx
<Link
  href={{
    pathname: '/nannies',
    query: { suburb: 'bondi', min_rate: 25 },
  }}
>
  Search Bondi
</Link>
```

---

## Protected Routes

### Middleware Protection
```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  // Protected routes
  const protectedPaths = ['/dashboard', '/messages', '/settings'];
  const isProtected = protectedPaths.some(path =>
    req.nextUrl.pathname.startsWith(path)
  );

  if (isProtected && !session) {
    const redirectUrl = new URL('/login', req.url);
    redirectUrl.searchParams.set('redirect', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Admin routes
  if (req.nextUrl.pathname.startsWith('/admin')) {
    // Check admin role
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', session?.user.id)
      .single();

    if (user?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/messages/:path*', '/admin/:path*'],
};
```

---

## Route Handlers

### API Routes
```typescript
// app/api/nannies/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const suburb = searchParams.get('suburb');

  const nannies = await searchNannies({ suburb });

  return Response.json({ data: nannies });
}

export async function POST(request: Request) {
  const body = await request.json();
  // Create nanny...
}
```

### Dynamic API Routes
```typescript
// app/api/nannies/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const nanny = await getNanny(params.id);
  return Response.json({ data: nanny });
}
```

---

## Loading & Error States

### Loading UI
```typescript
// app/nannies/loading.tsx
export default function Loading() {
  return <SearchSkeleton />;
}
```

### Error Handling
```typescript
// app/nannies/error.tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

### Not Found
```typescript
// app/nannies/[id]/not-found.tsx
export default function NotFound() {
  return (
    <div>
      <h2>Nanny not found</h2>
      <Link href="/nannies">Browse all nannies</Link>
    </div>
  );
}
```

---

## Redirects

### In next.config.js
```javascript
module.exports = {
  async redirects() {
    return [
      {
        source: '/search',
        destination: '/nannies',
        permanent: true,
      },
    ];
  },
};
```

### Server-Side Redirect
```typescript
import { redirect } from 'next/navigation';

export default async function Page() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  // ...
}
```

---

## Open Questions

- [ ] _Internationalization (i18n) support?_
- [ ] _Parallel routes needed?_
- [ ] _Intercepting routes for modals?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
