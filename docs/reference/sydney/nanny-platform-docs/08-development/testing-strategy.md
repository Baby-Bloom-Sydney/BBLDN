> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Testing Strategy

> How we test the Baby Bloom Sydney platform.

## Overview

_Testing approach, tools, and requirements._

---

## Testing Pyramid

```
        /\
       /  \
      / E2E \         Few, critical flows
     /______\
    /        \
   / Integr-  \       API tests, DB tests
  /  ation     \
 /______________\
/                \
/    Unit Tests   \   Many, fast, isolated
/__________________\
```

---

## Test Types

### Unit Tests
**Purpose:** Test individual functions and components in isolation

**What to test:**
- Utility functions
- Business logic
- Data transformations
- React hooks
- Component rendering

**Tools:** Jest, React Testing Library

### Integration Tests
**Purpose:** Test how components work together

**What to test:**
- API endpoints
- Database queries
- Service integrations
- Component interactions

**Tools:** Jest, Supertest

### End-to-End Tests
**Purpose:** Test complete user flows

**What to test:**
- User registration
- Login/logout
- Nanny search
- Booking flow
- Payment processing

**Tools:** Playwright

---

## Test Organization

```
src/
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   └── Button.test.tsx    # Colocated tests
│   └── ...
├── lib/
│   ├── utils.ts
│   └── utils.test.ts
└── ...

tests/
├── e2e/                       # E2E tests
│   ├── auth.spec.ts
│   ├── search.spec.ts
│   └── booking.spec.ts
├── integration/               # Integration tests
│   ├── api/
│   └── db/
└── fixtures/                  # Test data
```

---

## Unit Testing

### Example: Utility Function
```typescript
// lib/utils.ts
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
}

// lib/utils.test.ts
import { formatCurrency } from './utils';

describe('formatCurrency', () => {
  it('formats positive amounts', () => {
    expect(formatCurrency(35)).toBe('$35.00');
  });

  it('formats amounts with cents', () => {
    expect(formatCurrency(35.5)).toBe('$35.50');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });
});
```

### Example: React Component
```typescript
// components/NannyCard.test.tsx
import { render, screen } from '@testing-library/react';
import { NannyCard } from './NannyCard';

const mockNanny = {
  id: '1',
  firstName: 'Jane',
  hourlyRate: 35,
  suburb: 'Bondi',
  rating: 4.9,
};

describe('NannyCard', () => {
  it('renders nanny name', () => {
    render(<NannyCard nanny={mockNanny} />);
    expect(screen.getByText('Jane')).toBeInTheDocument();
  });

  it('displays hourly rate', () => {
    render(<NannyCard nanny={mockNanny} />);
    expect(screen.getByText('$35/hour')).toBeInTheDocument();
  });

  it('shows suburb', () => {
    render(<NannyCard nanny={mockNanny} />);
    expect(screen.getByText('Bondi')).toBeInTheDocument();
  });
});
```

---

## Integration Testing

### Example: API Endpoint
```typescript
// tests/integration/api/nannies.test.ts
import { createMocks } from 'node-mocks-http';
import handler from '@/app/api/nannies/route';

describe('/api/nannies', () => {
  it('returns nannies matching suburb', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { suburb: 'bondi' },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.data).toBeInstanceOf(Array);
  });
});
```

---

## E2E Testing

### Example: Auth Flow
```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can sign up as nanny', async ({ page }) => {
    await page.goto('/signup/nanny');

    await page.fill('[name="firstName"]', 'Jane');
    await page.fill('[name="lastName"]', 'Doe');
    await page.fill('[name="email"]', 'jane@example.com');
    await page.fill('[name="password"]', 'password123');

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('user can log in', async ({ page }) => {
    await page.goto('/login');

    await page.fill('[name="email"]', 'existing@example.com');
    await page.fill('[name="password"]', 'password123');

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard');
  });
});
```

---

## Test Configuration

### Jest Config
```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
```

### Playwright Config
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Test Data

### Fixtures
```typescript
// tests/fixtures/nannies.ts
export const mockNannies = [
  {
    id: '1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    hourlyRate: 35,
    suburb: 'Bondi',
    status: 'active',
  },
  // ... more fixtures
];
```

### Database Seeding
```sql
-- supabase/seed.sql
INSERT INTO users (id, email, first_name, role)
VALUES
  ('test-user-1', 'nanny@test.com', 'Test', 'nanny'),
  ('test-user-2', 'parent@test.com', 'Test', 'parent');
```

---

## Running Tests

```bash
# All unit tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:coverage

# E2E tests
pnpm test:e2e

# E2E with UI
pnpm test:e2e:ui
```

---

## Open Questions

- [ ] _Coverage thresholds?_
- [ ] _E2E test environments?_
- [ ] _Visual regression testing?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
