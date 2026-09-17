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
import type { Auth } from "@/modules/auth";
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
    return written.ok
      ? ok(ruleFromRow(written.value as AvailabilityRuleRow))
      : schedulingFailure(written.error);
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
    return written.ok ? ok(undefined) : schedulingFailure(written.error);
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
      affected.push(bookingFromRow(flagged.value));
    }
    const blockRow = written.value as AvailabilityBlockRow;
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
     * ★ **Not built, and pinned as a failing test rather than faked** (`scheduling.inside.test.ts`, "the
     * document's `unblock` removes a block"). 03 §3.2 says a block is removed and its slots return; 02 §4.4
     * row 3 gives `availability_blocks` no revocation column, and 03 §1.4's `Query` has no `delete`, so there
     * is no honest write that undoes one. Flipping `kind` to `'open'` was rejected: precedence is
     * blocked > open > rule, so an `open` row *adds* availability, and a block laid outside the rules would
     * come back as newly open time — a different calendar, not the one the admin had.
     *
     * Two candidate fixes, neither this unit's to make (no migration in `1f`; `shared-types` and `auth` are not
     * this unit's surface): a `delete` on `TableQuery` (the ADR-131 (1) class), or an
     * `availability_blocks.revoked_at` column in `0018`. Recorded in the L-007 PROGRESS entry.
     */
    unblock: async (
      _blockId: BlockId,
    ): Promise<Result<void, SchedulingErrorDetails>> => {
      const admin = await asAdmin();
      if (!admin.ok) return admin;
      return schedulingFailure(undefined, "NOT_IMPLEMENTED");
    },
  });
}
