> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Architecture Decision Records (ADRs)

> Record of significant technical and business decisions.

## Overview

_Document important decisions, the context, options considered, and rationale._

---

## ADR Template

```markdown
## ADR-XXX: [Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded
**Deciders:** [Who made this decision]

### Context
[What is the issue or situation that led to this decision?]

### Options Considered
1. **Option A:** [Description]
   - Pros: ...
   - Cons: ...

2. **Option B:** [Description]
   - Pros: ...
   - Cons: ...

### Decision
[What was decided and why]

### Consequences
[What are the results of this decision?]
- Positive: ...
- Negative: ...
- Risks: ...

### Related
- [Links to related ADRs or documents]
```

---

## ADR-001: Tech Stack Selection

**Date:** _YYYY-MM-DD_
**Status:** Accepted
**Deciders:** Bailey

### Context
Rebuilding Baby Bloom Sydney from a prototype (Wix, Google Sheets, Make.com) to a production-ready platform. Need to choose a modern tech stack that balances developer experience, scalability, and cost.

### Options Considered

1. **Next.js + Supabase + Vercel**
   - Pros: Modern, full-stack, excellent DX, Supabase handles auth/DB/storage
   - Cons: Vendor lock-in to some extent

2. **Next.js + PostgreSQL + AWS**
   - Pros: More control, widely used
   - Cons: More infrastructure to manage, higher complexity

3. **React + Node.js + MongoDB + Heroku**
   - Pros: Flexible, familiar stack
   - Cons: More moving parts, MongoDB less suited for relational data

### Decision
**Option 1: Next.js + Supabase + Vercel**

Rationale:
- Supabase provides auth, database, storage, and realtime out of the box
- Vercel offers excellent Next.js integration and easy deployments
- Reduces infrastructure management overhead
- Good for solo developer or small team
- Cost-effective at current scale

### Consequences
- Positive: Fast development, reduced ops burden
- Negative: Some vendor lock-in
- Risks: Supabase/Vercel pricing changes

---

## ADR-002: AI Model Selection

**Date:** _YYYY-MM-DD_
**Status:** Proposed
**Deciders:** _TBD_

### Context
Need AI capabilities for profile generation, document verification, and email coordination.

### Options Considered

1. **GPT-4o (OpenAI)** ✅ Selected
   - Pros: Large ecosystem, well-documented, widely used, vision capabilities, competitive pricing
   - Cons: None significant for our use case

2. **Claude (Anthropic)**
   - Pros: Excellent instruction following, strong at writing
   - Cons: Smaller ecosystem

3. **Mix of models**
   - Pros: Best tool for each job
   - Cons: More complexity, multiple integrations

### Decision
_To be decided_

### Consequences
_To be filled in_

---

## ADR-003: Payment Processor

**Date:** _YYYY-MM-DD_
**Status:** Proposed
**Deciders:** _TBD_

### Context
Need to process payments from parents and pay out to nannies.

### Options Considered

1. **Stripe Connect**
   - Pros: Industry standard, handles compliance, Connect for marketplaces
   - Cons: Fees

2. **PayPal**
   - Pros: Widely known
   - Cons: Higher fees, less developer-friendly

### Decision
_To be decided_

### Consequences
_To be filled in_

---

## ADR-004: Email Service

**Date:** _YYYY-MM-DD_
**Status:** Proposed
**Deciders:** _TBD_

### Context
Need to send transactional emails (welcome, verification, booking confirmations).

### Options Considered

1. **Resend**
   - Pros: Modern API, React Email templates, good DX
   - Cons: Newer service

2. **SendGrid**
   - Pros: Established, proven
   - Cons: More complex API

3. **AWS SES**
   - Pros: Cheap, scalable
   - Cons: More setup required

### Decision
_To be decided_

### Consequences
_To be filled in_

---

## Decision Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| 001 | Tech Stack Selection | Accepted | _Date_ |
| 002 | AI Model Selection | Proposed | _Date_ |
| 003 | Payment Processor | Proposed | _Date_ |
| 004 | Email Service | Proposed | _Date_ |

---

**Instructions:**
1. Create new ADR for significant decisions
2. Number sequentially (ADR-001, ADR-002, etc.)
3. Update status as decisions are made
4. Link related ADRs
