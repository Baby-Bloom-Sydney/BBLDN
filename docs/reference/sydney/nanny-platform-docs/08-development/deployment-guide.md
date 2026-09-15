> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Deployment Guide

> How to deploy Baby Bloom Sydney to production.

## Overview

_Deployment process using Vercel and Supabase._

---

## Deployment Architecture

```
┌─────────────────┐     ┌─────────────────┐
│     GitHub      │────▶│     Vercel      │
│   Repository    │     │    Hosting      │
└─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │    Supabase     │
                        │    Database     │
                        └─────────────────┘
```

---

## Environments

| Environment | Branch | URL | Supabase Project |
|-------------|--------|-----|------------------|
| Production | main | babybloomsydney.com.au | prod |
| Staging | staging | staging.babybloomsydney.com.au | staging |
| Preview | PR branches | *.vercel.app | dev |

---

## Initial Setup

### 1. Vercel Project Setup

```bash
# Install Vercel CLI
npm i -g vercel

# Link project
vercel link

# Set up environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_KEY
# ... add all required variables
```

### 2. Supabase Project Setup

1. Create projects at [supabase.com](https://supabase.com):
   - Production project
   - Staging project

2. Apply migrations:
```bash
# Link to project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

### 3. Domain Setup

1. Add domain in Vercel project settings
2. Update DNS records:
   - A record: Points to Vercel
   - CNAME: www → Vercel

---

## Deployment Process

### Automatic Deployments

**Production (main branch):**
1. PR merged to main
2. Vercel auto-deploys
3. Runs build
4. Runs tests
5. Deploys if all pass

**Staging:**
1. PR merged to staging
2. Same process as production

**Preview:**
1. PR opened
2. Vercel creates preview deployment
3. Preview URL posted to PR

### Manual Deployment

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

---

## Pre-Deployment Checklist

### Before Staging
- [ ] All tests passing locally
- [ ] Code reviewed and approved
- [ ] No console errors
- [ ] Performance acceptable
- [ ] Mobile responsive

### Before Production
- [ ] Staging tested thoroughly
- [ ] Database migrations tested
- [ ] Environment variables verified
- [ ] Rollback plan ready
- [ ] Team notified

---

## Database Migrations

### Migration Process

```bash
# 1. Create migration locally
supabase migration new migration_name

# 2. Test locally
supabase db reset

# 3. Apply to staging
supabase db push --db-url $STAGING_DATABASE_URL

# 4. Test in staging

# 5. Apply to production
supabase db push --db-url $PRODUCTION_DATABASE_URL

# 6. Deploy application code
```

### Rollback Migration

```bash
# Keep rollback SQL ready
# Apply if needed:
psql $DATABASE_URL -f rollback.sql
```

---

## Environment Variables

### Required for Production

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase key |
| `SUPABASE_SERVICE_KEY` | Server-side Supabase key |
| `STRIPE_SECRET_KEY` | **Live** Stripe key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RESEND_API_KEY` | Email service key |
| `OPENAI_API_KEY` | AI service key |

### Vercel Environment Variables

```bash
# Set for production only
vercel env add STRIPE_SECRET_KEY production

# Set for all environments
vercel env add NEXT_PUBLIC_SUPABASE_URL
```

---

## Monitoring Post-Deployment

### Immediate (0-15 min)
- [ ] Site loads correctly
- [ ] Can log in/out
- [ ] Critical paths working
- [ ] No errors in Vercel logs

### Short-term (1 hour)
- [ ] Monitor error tracking (Sentry)
- [ ] Check performance metrics
- [ ] Review user feedback channels

### Ongoing
- [ ] Daily error review
- [ ] Weekly performance review

---

## Rollback Procedure

### Vercel Rollback (Instant)

1. Go to Vercel Dashboard
2. Find previous successful deployment
3. Click "Promote to Production"

### Database Rollback

1. Have rollback SQL ready
2. Apply to production database
3. Then rollback application

---

## Troubleshooting

### Build Failures

```bash
# Check build locally
pnpm build

# Check Vercel build logs
vercel logs
```

### Runtime Errors

```bash
# Check Vercel function logs
vercel logs --follow

# Check Supabase logs
supabase logs
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Build fails | Check for TypeScript errors |
| 500 errors | Check environment variables |
| DB connection fails | Verify Supabase credentials |
| Stripe errors | Check webhook configuration |

---

## Open Questions

- [ ] _Blue-green deployment needed?_
- [ ] _Feature flags implementation?_
- [ ] _Deployment approval process?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
