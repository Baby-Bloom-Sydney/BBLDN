> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Google Apps Script Inventory

> Catalog of all Google Apps Scripts and Google Sheets structure.

## Overview

_Complete inventory of Google Sheets databases and Apps Script code._

---

## Google Sheets Structure

### Main Spreadsheet: _[Name]_
**URL:** _[Spreadsheet URL]_
**Owner:** _[Who owns this]_

#### Sheet: Nannies
| Column | Header | Data Type | Example |
|--------|--------|-----------|---------|
| A | ID | Text | "NAN001" |
| B | First Name | Text | "Jane" |
| C | Last Name | Text | "Doe" |
| D | Email | Email | "jane@email.com" |
| E | Phone | Phone | "0412345678" |
| F | Suburb | Text | "Bondi" |
| G | Hourly Rate | Currency | "$35" |
| H | Status | Dropdown | "Active" |
| I | Created Date | Date | "2024-01-15" |
| _Add more..._ | | | |

**Row count:** _[Current count]_
**Formulas:** _[Any calculated columns]_

#### Sheet: Parents
| Column | Header | Data Type | Example |
|--------|--------|-----------|---------|
| A | ID | Text | "PAR001" |
| _Add more..._ | | | |

#### Sheet: Bookings
| Column | Header | Data Type | Example |
|--------|--------|-----------|---------|
| A | ID | Text | "BOK001" |
| _Add more..._ | | | |

#### Sheet: _[Other sheets]_
_Document each sheet..._

---

## Google Apps Script Files

### Script Project: _[Name]_
**Bound to:** _[Spreadsheet name or Standalone]_
**URL:** _[Script URL]_

#### File: Code.gs
```javascript
// Summary of main functions

function onOpen() {
  // Menu setup
}

function processNewNanny() {
  // Process new nanny registration
}

// Add more function summaries...
```

**Functions:**
| Function | Trigger | Purpose |
|----------|---------|---------|
| onOpen | Menu | Custom menu setup |
| onEdit | Edit | Auto-process on edit |
| processNewNanny | Webhook | Handle new signups |
| sendEmail | Called | Send notification emails |
| _Add more..._ | | |

#### File: Triggers.gs
```javascript
// Trigger-related functions
```

#### File: Email.gs
```javascript
// Email templates and sending functions
```

---

## Triggers Configured

| Function | Trigger Type | Frequency/Event |
|----------|--------------|-----------------|
| onOpen | Simple | On spreadsheet open |
| dailyCleanup | Time-based | Daily at 2 AM |
| onFormSubmit | Form submit | When form submitted |
| _Add more..._ | | |

---

## External Connections

| Service | Purpose | How Connected |
|---------|---------|---------------|
| Gmail | Send emails | GmailApp |
| Google Drive | File storage | DriveApp |
| External API | _Purpose_ | UrlFetchApp |
| _Add more..._ | | |

---

## Data Validation Rules

### Nannies Sheet
| Column | Validation |
|--------|------------|
| Status | Dropdown: Active, Pending, Inactive |
| Suburb | _List of Sydney suburbs_ |
| _Add more..._ | |

---

## Named Ranges

| Name | Range | Purpose |
|------|-------|---------|
| NannyData | Nannies!A:Z | Reference all nanny data |
| _Add more..._ | | |

---

## Important Formulas

### Sheet: _[Name]_
| Cell/Column | Formula | Purpose |
|-------------|---------|---------|
| Column J | =DAYS(TODAY(),I2) | Days since signup |
| _Add more..._ | | |

---

## Migration Mapping

### Nannies Sheet → nannies table
| Sheet Column | → | Database Column |
|--------------|---|-----------------|
| A (ID) | → | id (generate new UUID) |
| B (First Name) | → | first_name |
| C (Last Name) | → | last_name |
| D (Email) | → | users.email |
| _Map all columns..._ | | |

### Data Transformation Needed
- [ ] _Transform 1: e.g., Split full name to first/last_
- [ ] _Transform 2: e.g., Convert dates_
- [ ] _Transform 3: e.g., Normalize suburbs_

---

## Open Questions

- [ ] _What scripts are running?_
- [ ] _What triggers are active?_
- [ ] _What data needs transformation?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
