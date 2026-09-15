> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Database Migrations

> Managing database schema changes over time.

## Overview

_Strategy for creating, testing, and deploying database migrations._

---

## Migration Tool

### Supabase Migrations
Using Supabase CLI for migration management.

```bash
# Install Supabase CLI
npm install -g supabase

# Initialize (if not done)
supabase init

# Create new migration
supabase migration new create_users_table

# Apply migrations locally
supabase db push

# Check migration status
supabase migration list
```

---

## Migration File Structure

```
supabase/
├── migrations/
│   ├── 20240101000000_create_users_table.sql
│   ├── 20240101000001_create_nannies_table.sql
│   ├── 20240101000002_create_parents_table.sql
│   ├── 20240102000000_add_verification_tables.sql
│   └── ...
└── seed.sql
```

### Naming Convention
```
YYYYMMDDHHMMSS_description.sql
```

Examples:
- `20240315100000_create_users_table.sql`
- `20240315100001_create_nannies_table.sql`
- `20240320090000_add_wwcc_verification.sql`

---

## Migration Template

```sql
-- Migration: [description]
-- Created: [date]
-- Author: [name]

-- ===========================================
-- UP MIGRATION
-- ===========================================

-- [Your migration SQL here]

CREATE TABLE example (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ===========================================
-- DOWN MIGRATION (in comments for reference)
-- ===========================================

-- DROP TABLE IF EXISTS example;
```

---

## Initial Migrations

### 001: Extensions
```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

### 002: Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  -- ... full schema
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
```

### 003: Nannies Table
```sql
CREATE TABLE nannies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  -- ... full schema
);

-- Geospatial index
CREATE INDEX idx_nannies_location ON nannies USING gist(location);
```

_Continue for all tables..._

---

## Migration Best Practices

### DO ✅
- [ ] One logical change per migration
- [ ] Include both up and down logic
- [ ] Test locally before deploying
- [ ] Backup before production migrations
- [ ] Use transactions where possible
- [ ] Add comments explaining complex changes

### DON'T ❌
- [ ] Modify existing migrations after deployment
- [ ] Delete migrations that have been applied
- [ ] Make breaking changes without migration path
- [ ] Skip testing in staging environment

---

## Deployment Workflow

### Local Development
```bash
# Start local Supabase
supabase start

# Create migration
supabase migration new add_feature

# Edit migration file

# Apply locally
supabase db push

# Test

# Commit migration file
git add supabase/migrations/
git commit -m "Add feature migration"
```

### Staging Deployment
```bash
# Apply to staging database
supabase db push --db-url $STAGING_DATABASE_URL

# Run tests against staging

# Verify data integrity
```

### Production Deployment
```bash
# Backup production database first!
pg_dump $PRODUCTION_DATABASE_URL > backup.sql

# Apply migrations
supabase db push --db-url $PRODUCTION_DATABASE_URL

# Verify deployment
# Monitor for issues
```

---

## Handling Data Migrations

### Adding a Column with Default
```sql
-- For small tables
ALTER TABLE nannies ADD COLUMN new_field VARCHAR(100) DEFAULT 'value';

-- For large tables (avoid locking)
ALTER TABLE nannies ADD COLUMN new_field VARCHAR(100);
-- Then backfill in batches
UPDATE nannies SET new_field = 'value' WHERE new_field IS NULL LIMIT 1000;
```

### Renaming a Column
```sql
-- Simple rename
ALTER TABLE nannies RENAME COLUMN old_name TO new_name;

-- If application needs both during transition:
-- 1. Add new column
-- 2. Copy data
-- 3. Update application
-- 4. Drop old column (separate migration)
```

### Changing Column Type
```sql
-- Safe type change
ALTER TABLE nannies ALTER COLUMN field TYPE VARCHAR(500);

-- Unsafe type change (may lose data)
-- 1. Add new column
-- 2. Migrate data with conversion
-- 3. Drop old column
-- 4. Rename new column
```

---

## Rollback Procedures

### Automatic Rollback
```sql
-- In migration file, wrap in transaction
BEGIN;

-- Migration statements

COMMIT;
-- If error, automatically rolled back
```

### Manual Rollback
```bash
# Keep down migration SQL ready
# Apply manually if needed:
psql $DATABASE_URL -f rollback_migration.sql
```

---

## Open Questions

- [ ] _Automated migration testing in CI?_
- [ ] _Zero-downtime migration strategy?_
- [ ] _Data migration tooling for large tables?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
