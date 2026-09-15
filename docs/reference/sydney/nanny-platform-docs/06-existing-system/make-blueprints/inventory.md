> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Make.com Blueprints Inventory

> Catalog of all Make.com (formerly Integromat) scenarios.

## Overview

_Complete inventory of automation workflows._

---

## Account Details

| Item | Value |
|------|-------|
| Account email | _[Email]_ |
| Plan | _[Free/Paid tier]_ |
| Operations limit | _[Monthly limit]_ |
| Current usage | _[Current month usage]_ |

---

## Active Scenarios

### Scenario 1: Nanny Signup
**ID:** _[Scenario ID]_
**Status:** Active
**Runs:** _[How often/trigger]_

```
[Wix Webhook]
    → [Data Formatter]
    → [Google Sheets: Add Row]
    → [Gmail: Send Email]
    → [Slack Notification]
```

**Trigger:** Webhook from Wix form submission
**Purpose:** Process new nanny registrations

**Modules:**
| # | Module | Purpose | Config Notes |
|---|--------|---------|--------------|
| 1 | Webhook | Receive form data | Custom webhook URL |
| 2 | Data Transformer | Format data | _Transformations_ |
| 3 | Google Sheets | Add to database | Sheet: Nannies |
| 4 | Gmail | Send welcome email | Template: Welcome |
| 5 | Slack | Notify team | Channel: #signups |

**Data mapping:**
| Input Field | → | Output Field |
|-------------|---|--------------|
| form.firstName | → | row.FirstName |
| form.email | → | row.Email |
| _Map all fields..._ | | |

---

### Scenario 2: Parent Signup
**ID:** _[Scenario ID]_
**Status:** Active

```
[Wix Webhook]
    → [Data Formatter]
    → [Google Sheets: Add Row]
    → [Gmail: Send Email]
```

_Document similar to above..._

---

### Scenario 3: Interview Coordination
**ID:** _[Scenario ID]_
**Status:** Active

_Document..._

---

### Scenario 4: _[Name]_
_Add more scenarios..._

---

## Inactive/Paused Scenarios

| Scenario | Status | Last Run | Notes |
|----------|--------|----------|-------|
| _Name_ | Paused | _Date_ | _Why paused_ |

---

## Webhooks

| Webhook Name | URL | Used By |
|--------------|-----|---------|
| Nanny Signup | https://hook.make.com/xxx | Wix nanny form |
| Parent Signup | https://hook.make.com/yyy | Wix parent form |
| _Add more..._ | | |

---

## Connected Apps

| App | Connection Name | Used In |
|-----|-----------------|---------|
| Google Sheets | BabyBloom Sheets | Multiple scenarios |
| Gmail | BabyBloom Gmail | Email sending |
| Slack | BabyBloom Workspace | Notifications |
| Wix | BabyBloom Website | Webhooks |
| _Add more..._ | | |

---

## Email Templates (in Make)

### Welcome Email - Nanny
**Subject:** "Welcome to Baby Bloom Sydney!"
**Template:**
```
Hi {{firstName}},

Welcome to Baby Bloom Sydney! We're excited to have you...

[Template content]
```

### Welcome Email - Parent
_Document template..._

### _Other templates..._

---

## Migration Plan

### Scenarios to Replicate

| Scenario | New System Equivalent |
|----------|----------------------|
| Nanny Signup | Supabase trigger + Edge Function |
| Parent Signup | Supabase trigger + Edge Function |
| Email sending | Resend API |
| _Map all scenarios..._ | |

### Can Be Simplified
- [ ] _Scenario that can be native Supabase_

### No Longer Needed
- [ ] _Deprecated scenario_

---

## Blueprint Exports

_Export and save Make.com scenario blueprints (JSON)_

| Scenario | Exported? | File Location |
|----------|-----------|---------------|
| Nanny Signup | ❌ | _To be exported_ |
| _Add more..._ | | |

---

## Open Questions

- [ ] _What scenarios are running?_
- [ ] _What are the operation limits?_
- [ ] _Which scenarios are business-critical?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
