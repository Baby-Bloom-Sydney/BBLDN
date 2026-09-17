// The in-memory `SpineStore` — the test double for every money rule and the store `stub-stripe` wiring can run on
// before a database is reachable. It mirrors the three RPCs of `0010_money.sql` **rule for rule** (idempotent
// trial mint, the done-for-you refusal, the `placed` upsert that never re-arms an unpaid first placement, the
// never-shrinking access window) so a test that passes here is a test of the rule, not of the double.
import { ok } from "@/modules/platform";
import type { FamilyId, Instant, Uuid } from "@/modules/shared-types";
import { addDays } from "./add-days";
import { blankSpineRow } from "./blank-spine-row";
import type {
  FamilyContact,
  PlacementTerms,
  SpineInsert,
  SpineRow,
  SpineStore,
} from "./spine-store";

export type MemorySpineSeed = {
  readonly rows?: ReadonlyArray<SpineRow>;
  readonly contacts?: Readonly<Record<string, FamilyContact>>;
  readonly placements?: Readonly<
    Record<string, PlacementTerms & { readonly startedAt: Instant | null }>
  >;
  /** Children's dates of birth per family — what `set_access_window` reads (ADR-083 / 084). */
  readonly childrenDob?: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly now?: () => Instant;
};

export type MemorySpineStore = SpineStore & {
  readonly rows: () => ReadonlyArray<SpineRow>;
  readonly events: () => ReadonlyArray<Readonly<Record<string, unknown>>>;
};

type EventRow = Readonly<Record<string, unknown>> & { readonly id: string };

type State = {
  rows: ReadonlyArray<SpineRow>;
  events: ReadonlyArray<EventRow>;
  readonly now: () => Instant;
  readonly seed: MemorySpineSeed;
};

const TRIAL_BLOCKING: ReadonlySet<SpineRow["status"]> = new Set([
  "active",
  "paid_in_full",
  "past_due",
  "placed",
  "cancelled",
]);

const find = (s: State, familyId: string): SpineRow | undefined =>
  s.rows.find((r) => r.parent_user_id === familyId);

const replace = (s: State, next: SpineRow): SpineRow => {
  s.rows = s.rows.map((r) => (r.id === next.id ? next : r));
  return next;
};

const insert = (s: State, row: SpineInsert): SpineRow => {
  const next: SpineRow = {
    ...blankSpineRow(row.parent_user_id as FamilyId, s.now()),
    ...row,
  };
  s.rows = [...s.rows, next];
  return next;
};

/** The youngest child's third birthday, or `null` with no child — `set_access_window` in memory. */
function windowFor(
  dobs: ReadonlyArray<string>,
  accessAgeYears: number,
): Instant | null {
  const youngest = [...dobs].sort().at(-1);
  if (youngest === undefined) return null;
  const date = new Date(`${youngest}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + accessAgeYears);
  return date.toISOString() as Instant;
}

function tableMethods(
  s: State,
): Pick<
  SpineStore,
  "readByFamily" | "listSpine" | "insertSpine" | "updateSpine"
> {
  return {
    readByFamily: async (familyId) => ok(find(s, familyId) ?? null),
    listSpine: async () => ok(s.rows),
    insertSpine: async (row) => ok(insert(s, row)),
    updateSpine: async (id, patch) => {
      const current = s.rows.find((r) => r.id === id);
      if (current === undefined) throw new Error("no such spine row");
      return ok(replace(s, { ...current, ...patch, updated_at: s.now() }));
    },
  };
}

/**
 * `apply_payment_event` (`0019`) in memory, statement for statement — the ledger insert, the spine update and
 * the `processed_at` stamp, in the order the function makes them and with the same three outcomes. Written
 * out here rather than composed from the other methods so that a test which passes against the double is a
 * test of the **rule**, the way the three `0010` RPCs above already are.
 */
function eventMethods(s: State): Pick<SpineStore, "applyEvent"> {
  const stampLedger = (
    eventId: string,
    patch: Readonly<Record<string, unknown>>,
  ): void => {
    s.events = s.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e));
  };
  return {
    applyEvent: async (delivery) => {
      // `on conflict … do nothing` returning nothing IS the duplicate: no spine write, no stamp, no money.
      const duplicate = s.events.some(
        (e) =>
          e.provider === delivery.provider &&
          e.provider_event_id === delivery.providerEventId,
      );
      if (duplicate) return ok({ outcome: "duplicate" });
      const eventId = crypto.randomUUID() as Uuid;
      s.events = [
        ...s.events,
        {
          id: eventId,
          provider: delivery.provider,
          provider_event_id: delivery.providerEventId,
          event_type: delivery.eventType,
          payload: delivery.payload,
          received_at: delivery.receivedAt,
          parent_user_id: null,
          processed_at: null,
          processing_error: null,
        },
      ];
      const familyId = delivery.familyId ?? null;
      const patch = delivery.spinePatch ?? null;
      // `ignored` (0020; ADR-146). No patch = no money in this delivery, whether because the caller could not
      // place it or because the standing does not act on that type. 03 §5.4.3 wants the record either way, so
      // the row stands stamped processed with no error - nothing is owed on it, and it does not join the
      // runbook's unprocessed queue. The family is kept when we have one: an ignored delivery we COULD place
      // is still that family's history.
      if (patch === null) {
        stampLedger(eventId, {
          processed_at: s.now(),
          parent_user_id: familyId,
        });
        return ok({ outcome: "ignored", eventId });
      }
      // A patch with no family is work that cannot be done, not work there is none of.
      if (familyId === null) {
        stampLedger(eventId, { processing_error: "E_EVENT_UNRESOLVED" });
        return ok({ outcome: "unresolved", eventId });
      }
      const current = find(s, familyId);
      // I-M1: the spine row is minted before a purchase can be dispatched against it.
      if (current === undefined) {
        stampLedger(eventId, {
          processing_error: "E_SPINE_MISSING",
          parent_user_id: familyId,
        });
        return ok({ outcome: "unresolved", eventId });
      }
      // `access_until` is `set_access_window()`'s alone (ADR-083 / 084): the function strips it from the
      // patch and calls that function instead, rather than letting a patch reach the column.
      const { access_until: _ownedElsewhere, ...writable } = patch;
      replace(s, { ...current, ...writable, updated_at: s.now() });
      let accessUntil: Instant | null = null;
      if (patch.status !== undefined && delivery.accessAgeYears != null) {
        const moved = await windowRpc(s).setAccessWindow(
          familyId,
          delivery.accessAgeYears,
        );
        accessUntil = moved.ok ? moved.value : null;
      }
      stampLedger(eventId, { processed_at: s.now(), parent_user_id: familyId });
      return ok({ outcome: "applied", eventId, accessUntil });
    },
  };
}

function trialRpc(s: State): Pick<SpineStore, "startTrial"> {
  return {
    startTrial: async (familyId, trialDays, enabled) => {
      const current = find(s, familyId);
      if (!enabled) return ok(current ?? null);
      const blocked =
        current !== undefined &&
        (current.has_used_trial ||
          current.placement_id !== null ||
          TRIAL_BLOCKING.has(current.status));
      if (blocked) return ok(current);
      const at = s.now();
      const trial = {
        status: "trial" as const,
        trial_started_at: at,
        trial_ends_at: addDays(at, trialDays),
        has_used_trial: true,
      };
      if (current === undefined)
        return ok(insert(s, { parent_user_id: familyId, ...trial }));
      if (current.trial_started_at !== null) return ok(current);
      return ok(replace(s, { ...current, ...trial }));
    },
  };
}

function dfyRpc(s: State): Pick<SpineStore, "openDfyAccess"> {
  return {
    openDfyAccess: async (familyId, placementId, afterDays, windowDays) => {
      const placement = s.seed.placements?.[placementId];
      if (placement === undefined || placement.startedAt === null)
        throw new Error("open_dfy_access: placement has not started");
      const started = placement.startedAt;
      const current = find(s, familyId);
      const opened = {
        status: "placed" as const,
        placement_id: placementId,
        dfy_access_opened_at: current?.dfy_access_opened_at ?? started,
        payment_due_at: current?.payment_due_at ?? addDays(started, afterDays),
        satisfaction_window_ends_at:
          current?.satisfaction_window_ends_at ?? addDays(started, windowDays),
        trial_started_at: null,
        trial_ends_at: null,
      };
      return ok(
        current === undefined
          ? insert(s, { parent_user_id: familyId, ...opened })
          : replace(s, { ...current, ...opened }),
      );
    },
  };
}

function windowRpc(s: State): Pick<SpineStore, "setAccessWindow"> {
  return {
    setAccessWindow: async (familyId, accessAgeYears) => {
      const current = find(s, familyId);
      if (current === undefined) throw new Error("no spine row");
      const until = windowFor(
        s.seed.childrenDob?.[familyId] ?? [],
        accessAgeYears,
      );
      if (until === null) return ok(null);
      const kept =
        current.access_until !== null && current.access_until > until
          ? current.access_until
          : until;
      replace(s, { ...current, access_until: kept });
      return ok(until);
    },
  };
}

function lookups(
  s: State,
): Pick<SpineStore, "familyContact" | "placementTerms"> {
  return {
    familyContact: async (familyId) => ok(s.seed.contacts?.[familyId] ?? null),
    placementTerms: async (placementId) => {
      const p = s.seed.placements?.[placementId];
      return ok(
        p === undefined
          ? null
          : { weeklyHours: p.weeklyHours, hourlyRatePence: p.hourlyRatePence },
      );
    },
  };
}

export function memorySpineStore(seed: MemorySpineSeed = {}): MemorySpineStore {
  const s: State = {
    rows: [...(seed.rows ?? [])],
    events: [],
    now: seed.now ?? (() => new Date().toISOString() as Instant),
    seed,
  };
  return Object.freeze({
    rows: () => s.rows,
    events: () => s.events,
    ...tableMethods(s),
    ...eventMethods(s),
    ...trialRpc(s),
    ...dfyRpc(s),
    ...windowRpc(s),
    ...lookups(s),
  });
}
