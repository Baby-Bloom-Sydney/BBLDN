// The `CallMirrorStore` of `call-layer` over the real schema (`1g`) — `nanny_positions`' four call columns
// (`0006`, R-1: the call's **state**) joined to `position_call_mirror` (`0018`: the call's **detail**).
//
// This replaces `memoryCallMirrorStore` at boot in every environment, which is what closes `1d`'s and
// `wire-call-layer.ts`'s recorded hole: a per-instance mirror forgets every booked call on a cold start, so on a
// serverless runtime a family could be told her call is set when nothing said so. That is why `call-layer` was
// refused in production until now.
//
// **Service scope, named here and in the module README (01 §6.3).** `position_call_mirror` has a parent's own-row
// SELECT policy, so a parent read *could* be session-scoped — but the two callers that matter have no session to
// read under: the C-row handlers run as `{ kind: 'system' }` inside a cascade, and `listOpen()` is the admin
// queue's enumeration across every family. One scope for the port is also one scope to reason about.
//
// **The write is one RPC and only one.** `upsert_call_mirror()` moves both rows in one transaction because
// ADR-127 settled that one unit of work is one RPC: two `update`s through 03 §1.4's `Query` are two
// transactions, and the half-state between them is an outcome recorded on a call the mirror still calls open.
import type { DataAccessPort } from "@/modules/auth";
import type {
  CallMirror,
  CallMirrorStore,
  OpenCallSummary,
} from "@/modules/call-layer";
import { ok } from "@/modules/platform";
import type {
  BookingId,
  Email,
  ISO,
  PositionId,
  Result,
  UnitOfWork,
  UserId,
} from "@/modules/shared-types";

/** `nanny_positions`, the call half (02 R-1) plus the parent pointer the mirror is keyed on. */
type PositionCallRow = {
  readonly id: string;
  readonly parent_id: string;
  readonly stage: string;
  readonly call_state: string;
  readonly call_type: string | null;
  readonly call_requested_at: string | null;
  readonly call_booking_id: string | null;
};

/** `position_call_mirror` (0018). */
type MirrorDetailRow = {
  readonly position_id: string;
  readonly outcome: string | null;
  readonly notes: string | null;
  readonly no_answer_count: number;
  readonly about_nanny: string | null;
  readonly version: number;
};

type Recipient = CallMirror["recipient"];

/**
 * A position whose `call_type` is null has never had a call — the columns are there from `0006` with a default,
 * so "row exists" is not the same question as "a call was requested". `call_type` is the one that is only ever
 * written by C-a / C-b, which is what makes it the honest witness.
 */
const hasCall = (row: PositionCallRow): boolean => row.call_type !== null;

const callTypeOf = (row: PositionCallRow): CallMirror["type"] =>
  row.call_type === "onboarding" ? "onboarding" : "matchmaking";

function composed(
  position: PositionCallRow,
  detail: MirrorDetailRow | null,
  parentUserId: UserId,
  recipient: Recipient,
): CallMirror {
  return Object.freeze({
    positionId: position.id as PositionId,
    parentId: parentUserId,
    type: callTypeOf(position),
    state: position.call_state as CallMirror["state"],
    bookingId: (position.call_booking_id as BookingId | null) ?? null,
    requestedAt: (position.call_requested_at ?? "") as ISO,
    ...(detail?.outcome == null
      ? {}
      : { outcome: detail.outcome as CallMirror["outcome"] }),
    recipient,
    ...(detail?.about_nanny == null ? {} : { aboutNanny: detail.about_nanny }),
    noAnswerCount: detail?.no_answer_count ?? 0,
    version: detail?.version ?? 1,
  });
}

/**
 * The parent behind a position, and the address a `call-confirmation` goes to. The mirror carries a resolved
 * recipient because 03 §8.1 says comms never looks a person up — but it is resolved on the way *out* of the
 * store, not stored: an address written at C-a time goes stale the moment the parent changes it, and
 * `user_profiles` is the one row that is not stale. That is also why `0018` holds no email column.
 */
async function partyOf(
  port: DataAccessPort,
  parentRowId: string,
): Promise<Result<{ readonly userId: UserId; readonly recipient: Recipient }>> {
  return port.run(
    {
      name: "call-layer.readParty",
      exec: async (q) => {
        const parent = (await q
          .from("parents")
          .eq("id", parentRowId)
          .single()) as { readonly user_id: string } | null;
        if (parent === null)
          throw new Error(`call-layer: no parent row ${parentRowId}`);
        const profile = (await q
          .from("user_profiles")
          .eq("user_id", parent.user_id)
          .single()) as {
          readonly email: string | null;
          readonly first_name: string | null;
        } | null;
        return {
          userId: parent.user_id as UserId,
          recipient: Object.freeze({
            email: (profile?.email ?? "") as Email,
            ...(profile?.first_name == null
              ? {}
              : { name: profile.first_name }),
          }),
        };
      },
    },
    { scope: "service" },
  );
}

async function detailOf(
  port: DataAccessPort,
  positionId: string,
): Promise<Result<MirrorDetailRow | null>> {
  return port.run(
    {
      name: "call-layer.readMirrorDetail",
      exec: async (q) =>
        (await q
          .from("position_call_mirror")
          .eq("position_id", positionId)
          .single()) as MirrorDetailRow | null,
    },
    { scope: "service" },
  );
}

async function hydrate(
  port: DataAccessPort,
  position: PositionCallRow,
): Promise<Result<CallMirror>> {
  const party = await partyOf(port, position.parent_id);
  if (!party.ok) return party;
  const detail = await detailOf(port, position.id);
  if (!detail.ok) return detail;
  return ok(
    composed(position, detail.value, party.value.userId, party.value.recipient),
  );
}

const summaryOf = (
  position: PositionCallRow,
  detail: MirrorDetailRow | null,
  parentUserId: UserId,
): OpenCallSummary =>
  Object.freeze({
    positionId: position.id as PositionId,
    parentId: parentUserId,
    type: callTypeOf(position),
    state: position.call_state as OpenCallSummary["state"],
    bookingId: (position.call_booking_id as BookingId | null) ?? null,
    requestedAt: (position.call_requested_at ?? "") as ISO,
    noAnswerCount: detail?.no_answer_count ?? 0,
    ...(detail?.about_nanny == null ? {} : { aboutNanny: detail.about_nanny }),
  });

export function dbCallMirrorStore(port: DataAccessPort): CallMirrorStore {
  const readPosition = (
    positionId: PositionId,
  ): Promise<Result<PositionCallRow | null>> =>
    port.run(
      {
        name: "call-layer.readPositionCall",
        exec: async (q) =>
          (await q
            .from("nanny_positions")
            .eq("id", positionId)
            .single()) as PositionCallRow | null,
      },
      { scope: "service" },
    );

  return Object.freeze({
    get: async (positionId: PositionId) => {
      const position = await readPosition(positionId);
      if (!position.ok) return position;
      if (position.value === null || !hasCall(position.value)) return ok(null);
      return hydrate(port, position.value);
    },

    findOpenForParent: async (parentId: UserId) => {
      const parent = await port.run(
        {
          name: "call-layer.readParentByUser",
          exec: async (q) =>
            (await q.from("parents").eq("user_id", parentId).single()) as {
              readonly id: string;
            } | null,
        },
        { scope: "service" },
      );
      if (!parent.ok) return parent;
      if (parent.value === null) return ok(null);
      const parentRowId = parent.value.id;
      const rows = await port.run(
        {
          name: "call-layer.readPositionsForParent",
          // 03 §1.4's `Query` has one equality predicate and no ordering, so "the open one" is decided here
          // rather than in SQL. I-1 makes that sound: a parent holds one live position, so one open call.
          exec: async (q) =>
            (await q
              .from("nanny_positions")
              .eq("parent_id", parentRowId)
              .select()) as ReadonlyArray<PositionCallRow>,
        },
        { scope: "service" },
      );
      if (!rows.ok) return rows;
      const open = rows.value.find(
        (row) => hasCall(row) && row.call_state !== "done",
      );
      return open === undefined ? ok(null) : hydrate(port, open);
    },

    put: async (mirror: CallMirror, uow?: UnitOfWork) =>
      port.run(
        {
          name: "call-layer.putMirror",
          exec: async (q) => {
            await q.rpc("upsert_call_mirror", {
              p_position_id: mirror.positionId,
              p_call_state: mirror.state,
              p_no_answer_count: mirror.noAnswerCount,
              p_version: mirror.version,
              p_call_type: mirror.type,
              p_call_requested_at: mirror.requestedAt,
              // an omitted argument IS the null: 0018's nullable parameters carry `default null`
              ...(mirror.bookingId === null
                ? {}
                : { p_call_booking_id: mirror.bookingId }),
              ...(mirror.outcome === undefined
                ? {}
                : { p_outcome: mirror.outcome }),
              ...(mirror.aboutNanny === undefined
                ? {}
                : { p_about_nanny: mirror.aboutNanny }),
            });
          },
        },
        { scope: "service", ...(uow === undefined ? {} : { uow }) },
      ),

    // 03 §3.6 — "awaiting-slot calls come from `call-layer`". `0006`'s D-12 index
    // (`nanny_positions (call_state) WHERE call_state <> 'done'`) is exactly this read's access path.
    listOpen: async () => {
      const open = await port.run(
        {
          name: "call-layer.listOpenPositions",
          exec: async (q) =>
            (await q
              .from("nanny_positions")
              .select()) as ReadonlyArray<PositionCallRow>,
        },
        { scope: "service" },
      );
      if (!open.ok) return open;
      const live = open.value.filter(
        (row) => hasCall(row) && row.call_state !== "done",
      );
      const rows: OpenCallSummary[] = [];
      for (const position of live) {
        const party = await partyOf(port, position.parent_id);
        if (!party.ok) return party;
        const detail = await detailOf(port, position.id);
        if (!detail.ok) return detail;
        rows.push(summaryOf(position, detail.value, party.value.userId));
      }
      return ok(Object.freeze(rows));
    },
  });
}
