> **reference, not spec — foundations win (`CLAUDE.md` Precedence).** Carried verbatim from Sydney at bootstrap (SEQUENCE Phase 0 "Docs carried"); excluded from every lint / literal test (05 §6 `docs/**`).

# Payment Rules

> Business rules for payments, fees, and financial transactions.

## Overview

_How money flows through the Baby Bloom Sydney platform._

---

## Fee Structure

### Platform Fees

| Fee Type | Amount | Paid By | When |
|----------|--------|---------|------|
| Service fee | _X%_ | Parent | Per booking |
| Processing fee | _Y%_ | _TBD_ | Per transaction |
| _Subscription?_ | _$Z/month_ | _TBD_ | _If applicable_ |

### Example Calculation
```
Booking: 4 hours @ $35/hour

Nanny rate:           $140.00
Platform fee (X%):    + $XX.XX
Processing fee:       + $X.XX
──────────────────────────────
Parent pays:          $XXX.XX

Nanny receives:       $140.00
Platform keeps:       $XX.XX
```

---

## Payment Flow

### Booking Payment Flow
```
1. Parent requests booking
        ↓
2. Nanny accepts
        ↓
3. Payment authorized (hold on card)
        ↓
4. Booking occurs
        ↓
5. Booking completed/confirmed
        ↓
6. Payment captured
        ↓
7. Nanny payout processed
```

### Payment States
| State | Description |
|-------|-------------|
| Pending | Awaiting nanny acceptance |
| Authorized | Card charged, funds held |
| Captured | Payment completed |
| Refunded | Payment reversed |
| Failed | Payment declined |

---

## Payment Timing

### When Parent is Charged
| Trigger | Timing |
|---------|--------|
| Booking accepted | Authorization hold |
| Booking completed | Capture payment |

### When Nanny is Paid
| Payout Schedule | Timing |
|-----------------|--------|
| Standard | 3-5 business days after booking |
| Express | _Future: instant payout option?_ |

### Payout Schedule
- Payouts processed: Daily / Weekly
- Minimum payout: $20
- Payout method: Bank transfer (Stripe Connect)

---

## Cancellation & Refunds

### Parent Cancellation

| Time Before Booking | Refund |
|--------------------|--------|
| > 48 hours | 100% refund |
| 24-48 hours | 50% refund |
| < 24 hours | No refund |
| No-show | No refund + potential account note |

### Nanny Cancellation

| Time Before Booking | Consequence |
|---------------------|-------------|
| > 48 hours | No penalty |
| 24-48 hours | Warning |
| < 24 hours | Strike on account |
| No-show | Serious penalty, potential suspension |

### Automatic Refund Rules
| Scenario | Refund |
|----------|--------|
| Nanny cancels | 100% refund |
| Platform cancels | 100% refund |
| Booking issue (platform fault) | 100% refund + credit |

---

## Dispute Handling

### Dispute Process
```
1. User files dispute (within 48h of booking)
        ↓
2. Platform reviews
        ↓
3. Gather info from both parties
        ↓
4. Decision made
        ↓
5. Refund/no refund processed
```

### Dispute Categories
| Category | Typical Resolution |
|----------|-------------------|
| Service not as described | Partial/full refund |
| Nanny didn't show | Full refund |
| Early departure | Pro-rated refund |
| Quality complaint | Case by case |

---

## Nanny Payout Rules

### Payout Requirements
- [ ] Verified identity
- [ ] Bank account connected (Stripe Connect)
- [ ] No pending disputes
- [ ] Account in good standing

### Payout Holds
| Reason | Hold Duration |
|--------|---------------|
| New nanny (first booking) | 7 days |
| Dispute in progress | Until resolved |
| Account flagged | Until reviewed |

---

## Tax Considerations

### Platform Responsibilities
- Issue tax documents (as required by ATO)
- Report payments over thresholds
- Provide annual summaries to nannies

### Nanny Responsibilities (Platform provides info, not advice)
- Nannies are independent contractors
- Responsible for own taxes
- Should seek own tax advice

---

## Payment Methods

### Accepted Payment Methods
| Method | Supported? |
|--------|-----------|
| Credit Card | ✅ |
| Debit Card | ✅ |
| Apple Pay | 🔶 _TBD_ |
| Google Pay | 🔶 _TBD_ |
| Bank Transfer | ❌ |
| Cash | ❌ (Not through platform) |

### Card Requirements
- Must be valid Australian card
- Sufficient funds for booking

---

## Pricing Display

### What Nannies See
- Hourly rate they set
- Expected earnings per booking
- Platform fee percentage

### What Parents See
- Nanny's hourly rate
- Service fee (separate line)
- Total cost
- GST (if applicable)

---

## Open Questions

- [ ] _What is the platform fee percentage?_
- [ ] _Subscription model or per-booking fees?_
- [ ] _Instant payout option?_
- [ ] _GST handling?_

---

**Last Updated:** _YYYY-MM-DD_
**Status:** 🔴 Not Started
