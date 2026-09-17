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

**The inside (`1f`).** `createScheduling({ auth })` is the real calendar: 02 §4.4's four tables through `auth`'s
data port at **service scope** (`0009` gives `bookings` no client write policy at all — this module is the one
writer), and `book_slot()` (02 §7) for the one write that must be atomic. Boot binds it in **every**
environment, replacing the in-memory stub P1-WIRE installed outside production only.

**Displacement lands as one RPC (ADR-127).** `0009`'s `book_slot()` deliberately does not generate slots or
search for the next free one — that would be a second source of truth for I-6 and I-7 beside
`lib/generate-slots.ts` and `lib/next-free-slot.ts`. So `lib/displace-to.ts` computes where the nanny goes with
the _same_ pure function the stub uses and hands it in as `p_displace_to`; the function locks the calendar,
moves her row and inserts the parent's in one transaction. If the target is taken by the time the lock is held,
`book_slot()` falls back to I-3 rather than failing the parent.

**Gaps (recorded, not hidden).**

1. **`unblock` is not built.** 03 §3.2 says a block is removed and its slots come back; 02 §4.4 row 3 gives
   `availability_blocks` no revocation column and 03 §1.4's `Query` has no `delete`, so no write available to
   this module lifts one. Flipping `kind` to `'open'` was rejected — precedence is blocked > open > rule, so an
   `open` row _adds_ availability and a block laid outside the rules would come back as new open time. The
   method refuses with `NOT_IMPLEMENTED` and the documented behaviour is pinned `it.fails`. **Owed:** a
   `delete` on `TableQuery` (the ADR-131 (1) class) or `availability_blocks.revoked_at` in `0018`.
2. **A position subject read back does not always carry its parent.** 03 §3.2's `Subject` has `parentId`;
   `bookings` stores only `subject_type` + `subject_id`, so after an **admin-on-behalf** booking the parent is
   not in the row (`booked_by_user_id` is the admin). Pinned `it.fails`. **Owed:** a `parent_id` column on
   02 §4.4 row 4, or the field optional on read-back in 03 §3.2. 03 §3.6 already says `admin` decorates the
   subject from `positions`, which is what the call queue does today.
3. **`hold` carries its subject and kind, amending 03 §3.2** — see `types.ts` on `HeldFor`. §3.2 writes
   `hold(slotId, actor)`, but its own `ACTIVE_STATUSES` includes `'held'` and I-10 says one active booking per
   subject, so a held row _has_ a subject; 02 §4.4 row 4 makes all three columns NOT NULL and `book_slot()`
   refuses a hold whose subject or kind does not match. The invariant won.
4. **`Query` has no range predicate** (03 §1.4 offers `select()` and ADR-131 (1)'s `eq()`), so `bookings` and
   `availability_blocks` are read by `calendar_id` and filtered by date in TypeScript. Honest at launch scale —
   one calendar, a 14-day horizon — and the same reading 1b recorded for `getPublicNanny`. **Owed:** a
   `between` / `gte` on `KeyedRead`.
5. **Weekday convention conflict, carried forward.** 02 §4.4 says `availability_rules.weekday` is 0–6 with
   **Mon = 0**; `config/scheduling.ts` comments its seed array `0 = Sunday`. `generateSlots` and
   `rule-from-row.ts` follow 02 (the document that owns the column) and both say so. `0009` seeds `0..4` under
   02's convention, so the database and the inside agree; `config`'s comment is the side that gets corrected.
6. **The stub still does not do I-2 / I-3 / I-13.** It returns `NOT_IMPLEMENTED` for a parent booking onto a
   nanny's slot rather than a quiet `SLOT_TAKEN`, and it does not flag `blocked-over` (I-4). Those are the real
   inside's, and are pinned there.
7. **No events yet.** `booking.held` · `booking.displaced` · `booking.displacement-failed` ·
   `booking.blocked-over` · `availability.changed` (03 §3.6) are not emitted. `book_slot()` returns `displaced`
   so the caller _can_ emit; `call-layer` is the caller 03 §3.6 names ("scheduling writes the row, the caller
   emits") and does not yet. **Owed to `1g`.**

**`requireRole('admin')` is applied** to `setAvailabilityRule` · `removeAvailabilityRule` · `block` · `unblock`
· `listSchedule` (03 §3.6), read from the **session** and never from the `Actor` the caller passed (FIX-1).

**Suites.** `scheduling.repo.test.ts` (folder shape, one export per file, allowed imports) ·
`scheduling.swap.test.ts` (03 §11 row 2) · `scheduling.inside.test.ts` (24 claims + the two pins above, over a
hand-rolled data port that records what reaches `book_slot()`).

<!-- audit
Last edited: 2026-09-17T18:40+10:00 — BB-LDN-Planner-070926/1f
Notes: 1f — the db-backed inside (create-scheduling), displacement as one book_slot() RPC, requireRole('admin') applied, and the hold's subject amendment. Gaps rewritten: unblock and the position subject's parent are pinned it.fails; the Query range predicate and the events are owed.
Prior: 2026-09-16T13:55+10:00 — BB-LDN-Planner-070926/F-b
Notes: created at F-b (ADR-117 Tier B) — the 03 §3.2 connector, the in-memory stub over the three shared pure functions, and the London wall-clock helpers. Displacement, the admin role gate and the events are recorded gaps.
-->
