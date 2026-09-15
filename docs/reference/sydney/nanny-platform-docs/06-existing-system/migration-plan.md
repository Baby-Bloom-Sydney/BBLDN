> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Migration Plan

> Strategy for migrating from current system to new platform.

## Overview

_Step-by-step plan for transitioning from Wix/Sheets/Make to Next.js/Supabase._

---

## Migration Phases

### Phase 0: Preparation (Week -2 to -1)
- [ ] Complete documentation of existing system
- [ ] Export all Make.com blueprints
- [ ] Backup all Google Sheets data
- [ ] Document all Wix Velo code
- [ ] Set up new system infrastructure

### Phase 1: Data Migration (Week 1)
- [ ] Create Supabase database schema
- [ ] Write migration scripts
- [ ] Migrate user data (test environment)
- [ ] Migrate nanny profiles
- [ ] Migrate parent profiles
- [ ] Migrate historical bookings
- [ ] Validate data integrity

### Phase 2: Feature Parity (Weeks 2-4)
- [ ] Implement authentication
- [ ] Implement nanny profiles
- [ ] Implement search
- [ ] Implement booking flow
- [ ] Implement messaging
- [ ] Implement notifications

### Phase 3: Testing (Week 5)
- [ ] Internal testing
- [ ] Beta user testing
- [ ] Performance testing
- [ ] Security audit

### Phase 4: Cutover (Week 6)
- [ ] Final data sync
- [ ] DNS switch
- [ ] Monitor for issues
- [ ] Decommission old system

---

## Data Migration

### Nannies Data
**Source:** Google Sheets → **Target:** Supabase

```
Current Sheets Structure:
| ID | FirstName | LastName | Email | Phone | ... |

New Database Structure:
users { id, email, phone, first_name, last_name, role }
nannies { id, user_id, bio, hourly_rate, ... }
```

**Transformation script:**
```typescript
// Pseudocode
for (const row of sheetsData) {
  // Create user record
  const user = await supabase.from('users').insert({
    email: row.Email,
    first_name: row.FirstName,
    last_name: row.LastName,
    phone: row.Phone,
    role: 'nanny',
  });

  // Create nanny profile
  await supabase.from('nannies').insert({
    user_id: user.id,
    bio: row.About,
    hourly_rate: parseFloat(row.HourlyRate),
    // ... map all fields
  });
}
```

### Parents Data
_Similar mapping..._

### Bookings Data
_Similar mapping..._

---

## Automation Migration

### Make.com → Supabase/Edge Functions

| Make Scenario | New Implementation |
|---------------|-------------------|
| Nanny Signup | Supabase trigger + Edge Function |
| Parent Signup | Supabase trigger + Edge Function |
| Welcome Email | Edge Function + Resend |
| Booking Notification | Realtime subscription + Edge Function |

### Example: Nanny Signup
**Make.com flow:**
```
Webhook → Transform → Add to Sheet → Send Email → Slack
```

**New flow:**
```
1. User signs up via Supabase Auth
2. Database trigger fires
3. Edge Function:
   - Creates nanny profile
   - Sends welcome email (Resend)
   - Posts to Slack (webhook)
```

---

## Feature Parity Checklist

### User Features
| Feature | Current | New | Status |
|---------|---------|-----|--------|
| Nanny signup | Wix form | Next.js form | ⬜ |
| Parent signup | Wix form | Next.js form | ⬜ |
| Profile editing | _How done now?_ | Dashboard page | ⬜ |
| Search nannies | _How done now?_ | Search page | ⬜ |
| Book nanny | _How done now?_ | Booking flow | ⬜ |
| Messaging | _How done now?_ | In-app chat | ⬜ |

### Admin Features
| Feature | Current | New | Status |
|---------|---------|-----|--------|
| View signups | Google Sheets | Admin dashboard | ⬜ |
| Verify nannies | Manual | Verification queue | ⬜ |
| Manage users | _How done now?_ | User management | ⬜ |

---

## Rollback Plan

### If Migration Fails
1. Keep old system running in parallel during cutover
2. DNS can be reverted within minutes
3. Data backups available for restoration
4. Communication plan for users

### Rollback triggers
- Critical bug affecting core functionality
- Data corruption detected
- Payment processing failure
- >5% of users reporting issues

---

## Communication Plan

### Before Migration
- [ ] Email users about upcoming changes
- [ ] FAQ page about new system
- [ ] Support channel for questions

### During Migration
- [ ] Maintenance page on old site
- [ ] Status updates via email/social

### After Migration
- [ ] Welcome to new platform email
- [ ] Tutorial/guide for new features
- [ ] Feedback collection

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Data migrated correctly | 100% |
| Core features working | 100% |
| User complaints | < 5% |
| Downtime during cutover | < 2 hours |
| No data loss | 0 records lost |

---

## Open Questions

- [ ] _How long can both systems run in parallel?_
- [ ] _What's the acceptable downtime window?_
- [ ] _Who needs to be on-call during cutover?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
