> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Deployment Strategy

> How code gets from development to production.

## Overview

_CI/CD pipeline and deployment workflow._

---

## Environments

| Environment | Branch | URL | Purpose |
|-------------|--------|-----|---------|
| Development | local | localhost:3000 | Local dev |
| Preview | PR branches | *.vercel.app | PR reviews |
| Staging | staging | staging.babybloomsydney.com.au | Pre-prod testing |
| Production | main | babybloomsydney.com.au | Live site |

---

## Git Workflow

### Branch Strategy
```
main (production)
  │
  ├── staging (pre-production)
  │     │
  │     ├── feature/user-auth
  │     ├── feature/nanny-search
  │     └── fix/booking-bug
  │
  └── hotfix/critical-fix (emergency)
```

### Branch Naming
| Type | Pattern | Example |
|------|---------|---------|
| Feature | feature/description | feature/nanny-profile |
| Fix | fix/description | fix/search-pagination |
| Hotfix | hotfix/description | hotfix/payment-error |
| Chore | chore/description | chore/update-deps |

---

## Deployment Pipeline

### Pull Request Flow
```
1. Developer creates PR
        ↓
2. Automated checks run
   - Linting (ESLint)
   - Type checking (TypeScript)
   - Unit tests (Jest)
   - Build test
        ↓
3. Vercel creates preview deployment
        ↓
4. Code review
        ↓
5. Approve and merge to staging
```

### Staging Deployment
```
1. Merge to staging branch
        ↓
2. Vercel auto-deploys to staging
        ↓
3. Run E2E tests
        ↓
4. Manual QA testing
        ↓
5. Approve for production
```

### Production Deployment
```
1. Merge staging to main
        ↓
2. Vercel auto-deploys to production
        ↓
3. Smoke tests run
        ↓
4. Monitor for errors
        ↓
5. Rollback if issues detected
```

---

## Vercel Configuration

### vercel.json
```json
{
  "framework": "nextjs",
  "regions": ["syd1"],
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase_url",
    "SUPABASE_SERVICE_KEY": "@supabase_service_key"
  }
}
```

### Environment Variables
| Variable | Dev | Staging | Production |
|----------|-----|---------|------------|
| NEXT_PUBLIC_SUPABASE_URL | .env.local | Vercel | Vercel |
| SUPABASE_SERVICE_KEY | .env.local | Vercel | Vercel |
| STRIPE_SECRET_KEY | Test key | Test key | Live key |
| RESEND_API_KEY | Test key | Test key | Live key |

---

## Database Migrations

### Migration Strategy
```
1. Create migration file
        ↓
2. Test locally
        ↓
3. Apply to staging DB
        ↓
4. Test in staging
        ↓
5. Apply to production DB
        ↓
6. Deploy application code
```

### Migration Commands
```bash
# Create new migration
npx supabase migration new migration_name

# Apply migrations locally
npx supabase db push

# Apply to staging/production
npx supabase db push --db-url $DATABASE_URL
```

---

## Rollback Strategy

### Application Rollback
```
1. Identify issue
        ↓
2. Vercel: Instant rollback to previous deployment
        ↓
3. Investigate and fix
        ↓
4. Deploy fix through normal process
```

### Database Rollback
- Each migration has up/down scripts
- Test rollback procedure before applying
- Keep backup before major changes

---

## Monitoring Post-Deploy

### Immediate (0-5 min)
- [ ] Check Vercel deployment logs
- [ ] Verify site loads
- [ ] Check critical paths (auth, search)

### Short-term (5-60 min)
- [ ] Monitor error rates (Sentry)
- [ ] Check performance metrics
- [ ] Review user feedback channels

### Ongoing
- [ ] Daily error report review
- [ ] Weekly performance review
- [ ] Monthly security audit

---

## CI/CD Tools

### GitHub Actions
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm test
```

---

## Open Questions

- [ ] _Staging environment database - separate or copy of prod?_
- [ ] _Feature flags for gradual rollouts?_
- [ ] _Blue-green deployments needed?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
