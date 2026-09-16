# scheduling

**What it does.** One live admin calendar, Europe/London (ADR-074): availability rules + blocks − active
bookings, computed at read (03 §3.1). It owns slots and bookings. It never moves a stage, sends no message
and imports no business module — `call-layer` calls `book` and then `advance(C-1)` with the `bookingId`.

**Importers are `call-layer`, `admin` and `admin-on-behalf` only** (03 §3.2 / §3.6; R3). `onboarding-nanny`
and `public-site` never import this module: S-N-02 books through `call-layer.listSlots` / `openNannyCall`.

**Connector** (03 §3.2).

| Area       | Values                                                                                       | Types                                                         |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| seam       | `scheduling` · `configureScheduling` · `unconfiguredScheduling`                              | `Scheduling` · `BookInput` · `BookOutcome` · `ScheduleFilter` |
| stub       | `createSchedulingStub`                                                                       | `SchedulingStubSeed`                                          |
| pure rules | `generateSlots` · `nextFreeSlot` · `canMoveStatus` · `londonInstant` · `londonOffsetMinutes` | `SchedulingReason` · `SchedulingErrorDetails`                 |

The data types (`Slot` · `Booking` · `AvailabilityRule` · `Block` · `CallListItem` · `ScheduleConfig`) live
in `shared-types/scheduling.ts` so `call-layer` can pass one through.

**Fail-closed by default.** The module-level `scheduling` answers `INTERNAL { reason:
'SCHEDULING_NOT_CONFIGURED' }` until `configureScheduling` installs an implementation — the in-memory stub
today, the real inside when its tables are on `main`, an external calendar later (03 §11 row 2).

**Stub (`scheduling.stub.ts`, 03 §3.6).** In-memory rules, blocks, bookings and holds over an injected clock,
sharing the pure functions the real inside will use. It honours **I-1** (no overlap), **I-5** (one calendar),
**I-7** (window from `config/scheduling.ts`), **I-8** (hold TTL), **I-9** (status lattice), **I-10** (one
active booking per subject), **I-11** (idempotent `book`) and **I-12** (`due` computed at read).

**What it may import.** `config` (+ `config/server`), `shared-types`, `platform`, `auth`, `areas`, `comms` —
per its 01 §2.3 row. In practice it uses `config`, `shared-types` and `platform` only; `auth` arrives with
the admin role checks.

**Gaps (recorded, not hidden).**

1. **Displacement is not built.** I-2 (parent over nanny), I-3 (no free slot → the nanny booking is
   cancelled) and I-13 (the per-day displacement cap) need `booking.displaced` /
   `booking.displacement-failed` events and a durable per-day counter. The stub returns
   `CONFLICT { reason: 'NOT_IMPLEMENTED' }` for a parent booking onto a nanny's slot rather than a quiet
   `SLOT_TAKEN`, so the gap cannot be mistaken for a rule.
2. **Weekday convention conflict, carried forward.** 02 §4.4 says `availability_rules.weekday` is 0–6 with
   **Mon = 0**; `config/scheduling.ts` comments its seed array `0 = Sunday`. `generateSlots` follows 02 (the
   document that owns the column) and says so at the top of the file. S5 recorded the same conflict; it needs
   one ruling, not two readings.
3. **`requireRole('admin')` is not applied** to `setAvailabilityRule` / `removeAvailabilityRule` / `block` /
   `unblock` / `listSchedule` (03 §3.6). It lands with the real inside, together with `auth`.
4. **No events and no store.** `booking.held` · `booking.displaced` · `booking.displacement-failed` ·
   `booking.blocked-over` · `availability.changed` (03 §3.6) are emitted by the real inside; the stub keeps
   its state in memory.
5. **`RULE_OVERLAP` is never returned** — the rule-overlap check belongs with the availability table.

<!-- audit
Last edited: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b (ADR-117 Tier B) — the 03 §3.2 connector, the in-memory stub over the three shared pure functions, and the London wall-clock helpers. Displacement, the admin role gate and the events are recorded gaps.
-->
