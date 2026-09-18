# call-layer

**What it does.** The call page, the slot picker and the call state for all three call types — `matchmaking`,
`onboarding` and `nanny-commission` (`00-glossary` §1.3; ADR-073). It owns the semantics and the events of all
three (03 §2.2), and it is the **only** business module besides `admin` and `admin-on-behalf` that may import
`scheduling` (R3): `onboarding-nanny` and `public-site` reach the calendar through `listSlots` / `openNannyCall`,
never directly.

**The subject rule (03 §2.2; 02 R-1) is the thing to understand first.** There is no `calls` table and no
`CallId`. A matchmaking or onboarding call **is the position's call mirror**, keyed by `positionId`. A
nanny-commission call **is the booking row**, keyed by `bookingId`, and its state is _derived_: `booked` /
`rescheduled` → `slot-chosen`; `done` / `cancelled` → `done`; `no-answer` → `awaiting-slot`, terminal for that
row, retried as a **new** booking (R5).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area           | Values                                                                                                     | Types                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| The call layer | `callLayer` (module binding) · `configureCallLayer`                                                        | `CallLayer` · `CallRef` · `CallResult` · `CallStateRead` · `OpenCall`      |
| The inside     | `createCallLayer` · `createCallLayerSlice` · `memoryCallMirrorStore` · `CALL_TRANSITIONS`                  | `CallLayerDeps` · `CallMirror` · `CallMirrorStore` · the C-row payloads    |
| The stage seam | `registerCallLayerSlice`                                                                                   | `CallLayerSlice`                                                           |
| The stub       | `stubCallLayer` (`call-layer.stub.ts`)                                                                     | `CallErrorDetails` · `CallLayerResult`                                     |
| The screens    | `loadCallPage` · `loadParentJourney` · the three actions · `CallPage` · `SlotPicker` · `ParentJourneyRail` | `CallPageView` · `SlotDay` · `SlotActions` · the prop types · the `*Load`s |
| The words      | `callRailLine` · `londonSlotWords` · `groupSlotsByDay` · `callPageView` · `RAIL_LABELS`                    | `LondonSlotWords` · `CallRailLineInput`                                    |

Methods (03 §2.7): `listSlots` · `chooseSlot` · `moveSlot` · `clearSlot` · `openNannyCall` · `recordOutcome` ·
`getCallState` — plus **`findOpenCall(parentId)`**, a connector extension recorded in the `1d` PROGRESS entry
(03 §2.7 has no "which call is mine" read; the call page cannot be reached without one), and **
`findNannyBooking(nannyId)`** (`2g`), its nanny half and raised the same way: S-N-02 must answer "have I already
picked a time?" and a `nanny-call` ref is keyed by the `bookingId` the page does not know. `CallResult` is a
**tagged** union, never `StateAfter | Booking` (fix: A-29).

**S-N-02's half (`2g`).** `listNannySlotsAction` + `bookNannyCallAction` are the nanny's two server actions:
she never holds (03 §3.2 names her form among the callers that reach `book` without one), the nanny is the
session and never the form (03 §3.2's `Subject` for her kind _is_ the nanny), and both her write and the
parent's two are bounded by 07 §8 row 6 (`bookingHolds`) — the policy had been declared with no consumer since
Phase 1 and its allow-list entry is now removed. `SlotPicker`'s actions became a tagged union so S-P-02 is
**reused** on S-N-02 rather than forked (04 §6.2); its four parent-voiced sentences are props with defaults.

**How the inside works (1d).** `createCallLayer(deps)` is the orchestrator 03 §2.7 describes: a `scheduling`
write, then `positions.advance` on the C row that names it, then the messages. `createCallLayerSlice(deps)` is
the state machine — the C rows of 03 §2.4 (C-a · C-b · C-c · C-1 · C-2 · C-3 · C-4 · C-5) as `TransitionHandler`s
over the **mirror store port**: each checks `from` / `expectedFrom`, the actor rule (a parent only on her own
call; a job only where the row names it), the row's precondition (C-1 / C-2: the booking is active and its
subject is this position — `BOOKING_NOT_FOR_SUBJECT`), writes the mirror under the caller's `uow`, emits the
`call.*` event under the same `uow` (a failed event write fails the transition), and answers a `StateAfter`.
`memoryCallMirrorStore` is the store today; the one over `nanny_positions` (0006's four call columns) arrives
with the RPC opener (P1-WIRE, ADR-127) and `positions`' inside (1e). The C-row idempotency is honoured as
written: `noop` rows answer the current state with no event; `key` rows replay the stored `StateAfter`; `reject`
answers `E_STALE_STATE`.

**The screens.** S-P-01 (`/parent/call`) renders `CallPage` from `loadCallPage()` — heading, the level-2 promise,
the variant line (after Connect · onboarding · after a no-answer), and S-P-02 `SlotPicker` inline: one
`radiogroup` per London day in a `fieldset` whose `legend` is the full date, every option named in full with
"London time" and a `<time datetime>`, tap = `holdSlotAction`, the button = `chooseSlotAction` (C-1, or C-2 while
a time stands — "Change time"), a taken slot / run-out hold in an alert that takes focus. S-P-03's rail is
`ParentJourneyRail` from `loadParentJourney()` — an `<ol>` with state as text and `aria-current="step"`; when the
read fails the six labels still stand (P-2, never an empty room). `positions.getJourneySteps` (1e) composes row
3's `detail` with `callRailLine` so the rail and the page never disagree about the words.

**What it may import.** `positions` (the stage-model connector only) · `scheduling` · `comms` (S) · `auth` (S) ·
`platform` (S) (01 §2.3). Because this row _does_ allow `positions`, `registerCallLayerSlice` lives here — unlike
`connections` and `placements`, whose rows do not.

**Gaps (recorded, not hidden).**

1. **`scheduling`'s inside is still the stub** (F-b). 03 §1.4's `Query` has no keyed read or filter
   (`select` reads a whole table), so `getBooking` / `listForSubject` / holds cannot be built over the data
   port yet; `book_slot()` exists but P1-WIRE's one-unit-of-work-one-RPC rule refuses the table writes around
   it. The displacement path (03 §3.3 I-2 / I-3 / I-13; §3.5 seq 3) is **not built** and is pinned as
   `it.fails` in `call-layer.inside.test.ts` rather than invented.
2. **`platform`'s `piiSafeString` refuses ~15 % of random uuids** (measured 2 944 / 20 000): a digit run of 9+
   across hyphens reads as a phone number. Under a `uow` that fails the C row. Pinned as `it.fails` in
   `call-layer.inside.test.ts`; the suites pin the uuid mint to stay deterministic. Owned by `platform`.
3. **CLOSED by `2g`.** Both messages are sent at `openNannyCall` (`lib/send-nanny-call-messages.ts`). The road
   `1d` lacked is ADR-136: a `Recipient` may be `{ userId }` and `comms` resolves it inside its own send, so
   the nanny's address never exists in this module at all — stricter than the mirror's `{ email }`, and the
   reason no nanny recipient needed a home. The admin's address is not a user id, so boot hands it in
   (`CallLayerDeps.adminEmail` ← `SENDERS.admin`; L4). Neither send can fail the booking (01 §4a rule 2).
4. **`getJourneySteps` is keyed by `ParentId`; a session carries a `UserId`** (02 §4 gives `parents` its own
   id). `loadParentJourney` passes the user id through in one place until 1e settles the key.
5. **The mirror store and the booking are not one transaction** until the store lives inside the RPC opener:
   `chooseSlot` undoes the booking (`cancel`) when `advance` refuses, so a parent is never told a time is set
   that the mirror does not hold.

**Suites.** `call-layer.swap.test.ts` (03 §11 tests 1 / 2) · `call-layer.fail-closed.test.ts` (the registry
default) · `call-layer.inside.test.ts` (the orchestrator + slice over the scheduling stub and the memory store: C-1
… C-5, C-a / C-c, the actor rule, idempotency, the messages, the two pins) · `call-layer.words.test.ts` (London
wall clock across DST, the day grouping, the row-3 line, the page variant) · `call-layer.screens.test.tsx` (S-P-01 ·
S-P-02 · S-P-03 rendered, keyboard + ARIA semantics) · `call-layer.actions.test.ts` (the three actions and the
page read, signed out and in) · `call-layer.copy.test.ts` (05 §5.2 over every rendered surface, the S-P-01
allowlist row applied exactly).

<!-- audit
Last edited: 2026-09-18T16:20+10:00 — BB-LDN-Planner-070926/2g
Notes: S-N-02's booking half (L-008 2g) — the two nanny actions, `findNannyBooking`, the two messages (gap 3 closed), the SlotPicker generalisation, and `bookingHolds` wired on all three calendar writes.
Prior: 2026-09-17T13:40+10:00 — BB-LDN-Planner-070926/1d
Notes: the inside (orchestrator + C-row slice + memory mirror store), the S-P-01 / S-P-02 / S-P-03 screens, the
actions, the words; connector extension `findOpenCall` recorded; five gaps recorded (scheduling stub stays, the
platform uuid defect, the nanny recipient, the journey key, the two-write seam).
Prior: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a — the F-a connector, the seam, the stub, the swap test.
-->
