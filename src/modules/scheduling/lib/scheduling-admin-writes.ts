// The four admin methods of 03 §3.2 — the availability rules and the blocks behind S-A-03.
//
// **Authority comes from the session, never from the `Actor` the caller passed.** 03 §3.6 gives this module
// `auth (S; requireRole('admin') on the admin methods)` and 03 §3.4 says `FORBIDDEN` when a non-admin calls
// one; `requireRole('admin')` also requires `aal2` (07 §5.4 row 2). FIX-1's lesson is the reason it is spelled
// out here: a caller-supplied `actor.kind === 'admin'` is a claim, not a credential.
//
// **ADR-077 / I-4 is the shape of `block`.** A block over an existing booking **flags** it (`needs_attention`
// + `attention_reason = 'blocked-over'`) and returns it as `affected`; it never cancels it. The admin moves or
// clears each flagged call by hand from S-A-04.
import { ok } from "@/modules/platform";
import type {
  AvailabilityRule,
  Block,
  BlockId,
  Booking,
  BookingId,
  ISO,
  ISODate,
  Result,
  RuleId,
  Uuid,
} from "@/modules/shared-types";
import type {
  AvailabilityBlockRow,
  AvailabilityRuleRow,
  CalendarReads,
  SchedulingContext,
  SchedulingErrorDetails,
} from "../types";
import { bookingFromRow } from "./booking-from-row";
import { schedulingEvents } from "./scheduling-events";
import { patchBooking } from "./patch-booking";
import { resolveCalendar } from "./resolve-calendar";
import { ruleFromRow } from "./rule-from-row";
import { schedulingFailure } from "./scheduling-failure";

const DAY_MS = 86_400_000;
const ACTIVE = new Set<string>(["held", "booked", "rescheduled"]);

/** Two rules clash when the same weekday's hours overlap while both are in force (I: `RULE_OVERLAP`). */
const clashes = (
  left: Omit<AvailabilityRule, "id">,
  right: AvailabilityRule,
): boolean =>
  left.weekday === right.weekday &&
  left.startLocal < right.endLocal &&
  left.endLocal > right.startLocal &&
  (left.effectiveTo === undefined ||
    right.effectiveFrom === undefined ||
    left.effectiveTo >= right.effectiveFrom) &&
  (right.effectiveTo === undefined ||
    left.effectiveFrom === undefined ||
    right.effectiveTo >= left.effectiveFrom);

export function schedulingAdminWrites(
  context: SchedulingContext,
  calendarReads: CalendarReads,
) {
  const { auth, reads, clock } = context;
  const service = { scope: "service" as const };

  /** 07 §5.4 rows 1–2: the session is the authority, and an admin session must be `aal2`. */
  const asAdmin = async (): Promise<Result<Uuid, SchedulingErrorDetails>> => {
    const session = await auth.requireRole("admin");
    return session.ok
      ? ok(session.value.userId as string as Uuid)
      : schedulingFailure(undefined, "FORBIDDEN");
  };

  const setAvailabilityRule = async (
    rule: Omit<AvailabilityRule, "id"> & { readonly id?: RuleId },
  ): Promise<Result<AvailabilityRule, SchedulingErrorDetails>> => {
    const admin = await asAdmin();
    if (!admin.ok) return admin;
    const calendar = await resolveCalendar(reads);
    if (!calendar.ok) return calendar;
    const existing = await reads.rules(calendar.value.id);
    if (!existing.ok) return schedulingFailure(existing.error);
    const others = existing.value
      .filter((row) => row.id !== rule.id)
      .map(ruleFromRow);
    if (others.some((other) => clashes(rule, other)))
      return schedulingFailure(undefined, "RULE_OVERLAP");
    const columns = {
      calendar_id: calendar.value.id,
      weekday: rule.weekday,
      start_time: `${rule.startLocal}:00`,
      end_time: `${rule.endLocal}:00`,
      effective_from: rule.effectiveFrom ?? null,
      effective_to: rule.effectiveTo ?? null,
      created_by: admin.value,
    };
    const written = await auth.data.run(
      {
        name: "scheduling.setAvailabilityRule",
        exec: (q) =>
          rule.id === undefined
            ? q.from("availability_rules").insert(columns)
            : q
                .from("availability_rules")
                .update(rule.id as string as Uuid, columns),
      },
      service,
    );
    if (!written.ok) return schedulingFailure(written.error);
    const saved = ruleFromRow(written.value as AvailabilityRuleRow);
    // 03 §3.6 — the calendar's shape changed, so the slots a family is shown changed with it.
    schedulingEvents.availabilityChanged(
      { kind: "admin", id: admin.value as never },
      "created",
      { ruleId: saved.id },
    );
    return ok(saved);
  };

  /**
   * ★ A **soft** removal, and the contract already has the word for it. 03 §1.4's `Query` has `select` ·
   * `insert` · `update` · `eq` and **no delete**, so this closes the rule with `effectiveTo` — the field 03
   * §3.2 puts on `AvailabilityRule` for exactly "no longer in force". `generate-slots.ts` stops applying it the
   * next day. Nothing is invented and nothing is lost; the audit trail of when the admin opened that weekday
   * survives, which a delete would have thrown away.
   */
  const removeAvailabilityRule = async (
    ruleId: RuleId,
  ): Promise<Result<void, SchedulingErrorDetails>> => {
    const admin = await asAdmin();
    if (!admin.ok) return admin;
    const yesterday = new Date(Date.parse(clock()) - DAY_MS)
      .toISOString()
      .slice(0, 10) as ISODate;
    const written = await auth.data.run(
      {
        name: "scheduling.removeAvailabilityRule",
        exec: (q) =>
          q
            .from("availability_rules")
            .update(ruleId as string as Uuid, { effective_to: yesterday }),
      },
      service,
    );
    if (!written.ok) return schedulingFailure(written.error);
    schedulingEvents.availabilityChanged(
      { kind: "admin", id: admin.value as never },
      "removed",
      { ruleId },
    );
    return ok(undefined);
  };

  const block = async (
    range: { readonly start: ISO; readonly end: ISO },
    reason: string,
  ): Promise<
    Result<
      { readonly block: Block; readonly affected: ReadonlyArray<Booking> },
      SchedulingErrorDetails
    >
  > => {
    const admin = await asAdmin();
    if (!admin.ok) return admin;
    const loaded = await calendarReads.loadCalendar();
    if (!loaded.ok) return loaded;
    const written = await auth.data.run(
      {
        name: "scheduling.block",
        exec: (q) =>
          q.from("availability_blocks").insert({
            calendar_id: loaded.value.calendar.id,
            kind: "blocked",
            start_at: range.start,
            end_at: range.end,
            reason,
            created_by: admin.value,
          }),
      },
      service,
    );
    if (!written.ok) return schedulingFailure(written.error);
    // I-4 / ADR-077: flag, never cancel. Each flagged row is returned so S-A-03 can show what needs a hand.
    const overlapped = loaded.value.bookings.filter(
      (row) =>
        ACTIVE.has(row.status) &&
        row.start_at < range.end &&
        row.end_at > range.start,
    );
    const affected: Array<Booking> = [];
    for (const row of overlapped) {
      const flagged = await patchBooking(
        auth,
        "flagBlockedOver",
        row.id as BookingId,
        {
          needs_attention: true,
          attention_reason: "blocked-over",
        },
      );
      if (!flagged.ok) return flagged;
      // ADR-143 — the flagged row's parent is joined, not invented. A row whose position is gone is still
      // flagged in the database (the block is over its time either way); it simply cannot be *returned* as a
      // `Booking`, so it is left out of the list the admin screen shows rather than given a fabricated parent.
      const parentId = await calendarReads.parentFor(flagged.value);
      if (!parentId.ok) return parentId;
      const booking = bookingFromRow(flagged.value, parentId.value);
      if (booking !== null) affected.push(booking);
    }
    const blockRow = written.value as AvailabilityBlockRow;
    // 03 §3.6 / §3.5 seq 4: an admin notification only, no customer message — the admin opens each and moves
    // or clears it herself (I-4 / ADR-077: a block flags, it never cancels).
    for (const booking of affected)
      schedulingEvents.blockedOver(
        { kind: "admin", id: admin.value as never },
        booking,
        blockRow.id,
      );
    schedulingEvents.availabilityChanged(
      { kind: "admin", id: admin.value as never },
      "created",
      { blockId: blockRow.id as BlockId },
    );
    return ok({
      block: Object.freeze({
        id: blockRow.id as BlockId,
        start: blockRow.start_at as ISO,
        end: blockRow.end_at as ISO,
        reason: blockRow.reason ?? reason,
        createdBy: admin.value as string as Block["createdBy"],
      }),
      affected: Object.freeze(affected),
    });
  };

  return Object.freeze({
    asAdmin,
    setAvailabilityRule,
    removeAvailabilityRule,
    block,
    /**
    /**
     * 03 §3.2 `unblock`. `1f` pinned this `it.fails` and named its own fix: `availability_blocks` had no
     * revocation column, 03 §1.4's `Query` has no `delete`, and flipping `kind` to `'open'` was rejected
     * because precedence is blocked > open > rule — an `open` row *adds* availability, so a block laid outside
     * the rules would come back as newly open time.
     *
     * `0018` adds `revoked_at`, which is the honest write: the block goes out of force and the row survives,
     * so the bookings it flagged stay auditable (I-4 / ADR-077 again — a block never erases its own history).
     * The in-force predicate is `revoked_at is null` and lives in one place, `scheduling-reads.ts`.
     */
    unblock: async (
      blockId: BlockId,
    ): Promise<Result<void, SchedulingErrorDetails>> => {
      const admin = await asAdmin();
      if (!admin.ok) return admin;
      const written = await auth.data.run(
        {
          name: "scheduling.unblock",
          exec: (q) =>
            q.from("availability_blocks").update(blockId as string as Uuid, {
              revoked_at: clock(),
            }),
        },
        service,
      );
      if (!written.ok) return schedulingFailure(written.error);
      schedulingEvents.availabilityChanged(
        { kind: "admin", id: admin.value as never },
        "removed",
        { blockId },
      );
      return ok(undefined);
    },
  });
}
