// The `SpineStore` over `auth`'s data port (01 §6.3; 03 §1.4). Every operation is a `NamedOperation` so the port
// logs and scopes it; nothing here throws across the seam — the port turns a driver throw into `INTERNAL`.
//
// **Every by-id read is a keyed read (ADR-131 (1), S5b).** `from(name).eq(column, value).single()` is the whole
// road: one row over the wire, the predicate in Postgres, and `single()` refusing at the seam when two rows
// match — which on a money table is the difference between "this family's standing" and "some family's
// standing". The earlier draft of this file scanned `parent_subscriptions` and filtered in memory because the
// port had no predicate; that landmine is gone and must not come back. The one remaining whole-table read is
// `listSpine`, which the sweeps genuinely want (every row, once per run).
//
// **Scope, per operation.** Parent-facing reads run `session` so RLS bounds them to the caller's own row; the
// webhook, the sweeps and the three RPCs run `service` — the caller is the provider or a cron, not a session.
import type { AppDatabase, DataAccessPort } from "@/modules/auth";
import type { Email, Instant, Uuid } from "@/modules/shared-types";
import type { ApplyEventOutcome, SpineStore } from "./spine-store";

function reads(
  port: DataAccessPort,
): Pick<
  SpineStore,
  "readByFamily" | "listSpine" | "familyContact" | "placementTerms"
> {
  return {
    readByFamily: (familyId, scope) =>
      port.run(
        {
          name: "payments.readByFamily",
          exec: (q) =>
            q
              .from("parent_subscriptions")
              .eq("parent_user_id", familyId)
              .single(),
        },
        { scope },
      ),
    listSpine: () =>
      port.run(
        {
          name: "payments.listSpine",
          exec: (q) => q.from("parent_subscriptions").select(),
        },
        { scope: "service" },
      ),
    familyContact: (familyId) =>
      port.run(
        {
          name: "payments.familyContact",
          exec: async (q) => {
            const row = await q
              .from("user_profiles")
              .eq("user_id", familyId)
              .single();
            return row === null
              ? null
              : {
                  userId: row.user_id as Uuid,
                  email: row.email as Email | null,
                  firstName: row.first_name,
                };
          },
        },
        { scope: "service" },
      ),
    placementTerms: (placementId) =>
      port.run(
        {
          name: "payments.placementTerms",
          exec: async (q) => {
            const row = await q
              .from("nanny_placements")
              .eq("id", placementId)
              .single();
            return row === null
              ? null
              : {
                  weeklyHours: row.weekly_hours,
                  hourlyRatePence: row.hourly_rate_pence,
                };
          },
        },
        { scope: "service" },
      ),
  };
}

function writes(
  port: DataAccessPort,
): Pick<SpineStore, "insertSpine" | "updateSpine" | "applyEvent"> {
  return {
    insertSpine: (row) =>
      port.run(
        {
          name: "payments.insertSpine",
          exec: (q) => q.from("parent_subscriptions").insert(row),
        },
        { scope: "service" },
      ),
    updateSpine: (id, patch) =>
      port.run(
        {
          name: "payments.updateSpine",
          exec: (q) => q.from("parent_subscriptions").update(id, patch),
        },
        { scope: "service" },
      ),
    // **The webhook's three writes, made one (`0019`; ADR-127).** `1h` shipped them as a ledger `insert`, a
    // spine `update` and a `processed_at` `update` — three implicit transactions under PostgREST, so a crash
    // between them left money applied against a delivery that was never stamped, or a stamped delivery whose
    // money never landed. `apply_payment_event` is the same three statements inside one transaction: a failure
    // rolls the ledger row back with the money and the provider retries, and the `unresolved` outcome commits
    // the ledger row with its `processing_error` and no spine write — exactly the row the runbook reconciles.
    //
    // **`0020` (ADR-146) made it the only `payment_events` write here.** The function gained a fourth outcome,
    // `ignored`: a delivery with no patch has no money in it, so it is recorded and stamped `processed_at` by
    // this same call. `stampEvent` — the second statement the no-money paths used to need, and the last raw
    // `from("payment_events").update()` in the module — has no caller left and is gone.
    //
    // Every argument is decided above this seam. The function's own refusals are not exceptions but outcomes,
    // so nothing here has to translate an error code.
    applyEvent: (delivery) =>
      port.run(
        {
          name: "payments.applyEvent",
          exec: async (q) =>
            outcomeOf(
              await q.rpc("apply_payment_event", {
                p_provider: delivery.provider,
                p_provider_event_id: delivery.providerEventId,
                p_event_type: delivery.eventType,
                p_payload: delivery.payload as ApplyArgs["p_payload"],
                p_received_at: delivery.receivedAt,
                // `0019` gives the last three `default null`, and an omitted argument IS that null — the
                // same seam `upsert_placement`'s `p_connection_id` uses. Sending an explicit null would be
                // the same answer; omitting keeps the generated `Args` type honest about which are optional.
                ...(delivery.familyId == null
                  ? {}
                  : { p_parent_user_id: delivery.familyId as string }),
                ...(delivery.spinePatch == null
                  ? {}
                  : {
                      p_spine_patch:
                        delivery.spinePatch as ApplyArgs["p_spine_patch"],
                    }),
                ...(delivery.accessAgeYears == null
                  ? {}
                  : { p_access_age_years: delivery.accessAgeYears }),
              }),
            ),
        },
        { scope: "service" },
      ),
  };
}

/** `0019`'s generated argument shape, so the two `jsonb` seams are typed by the migration itself. */
type ApplyArgs = AppDatabase["Functions"]["apply_payment_event"]["Args"];

/**
 * `apply_payment_event`'s `jsonb` answer, read as the outcome the spine turns on. An answer the driver cannot
 * give (a double that records the call, a function that returned null) is `unresolved` with no id rather than
 * a crash: the ledger row's fate is the database's to state, "we do not know" is not "applied" — and it is not
 * `ignored` either, because `ignored` asserts the row was stamped processed and an unreadable answer asserts
 * nothing. The unknown falls to the outcome that leaves the delivery on the runbook's queue.
 */
function outcomeOf(answer: unknown): ApplyEventOutcome {
  const held = (answer ?? {}) as {
    readonly outcome?: string;
    readonly event_id?: string | null;
    readonly access_until?: string | null;
  };
  if (held.outcome === "duplicate") return { outcome: "duplicate" };
  if (held.outcome === "ignored")
    return {
      outcome: "ignored",
      eventId: (held.event_id ?? null) as Uuid | null,
    };
  if (held.outcome === "applied" && held.event_id != null)
    return {
      outcome: "applied",
      eventId: held.event_id as Uuid,
      accessUntil: (held.access_until ?? null) as Instant | null,
    };
  return {
    outcome: "unresolved",
    eventId: (held.event_id ?? null) as Uuid | null,
  };
}

function rpcs(
  port: DataAccessPort,
): Pick<SpineStore, "startTrial" | "openDfyAccess" | "setAccessWindow"> {
  return {
    startTrial: (familyId, trialDays, newTrialsEnabled) =>
      port.run(
        {
          name: "payments.startTrial",
          exec: async (q) =>
            (await q.rpc("start_family_trial_if_first", {
              p_parent_user_id: familyId,
              p_trial_days: trialDays,
              p_new_trials_enabled: newTrialsEnabled,
            })) ?? null,
        },
        { scope: "service" },
      ),
    openDfyAccess: (familyId, placementId, afterStartDays, windowDays) =>
      port.run(
        {
          name: "payments.openDfyAccess",
          exec: (q) =>
            q.rpc("open_dfy_access", {
              p_parent_user_id: familyId,
              p_placement_id: placementId,
              p_payment_after_start_days: afterStartDays,
              p_satisfaction_window_days: windowDays,
            }),
        },
        { scope: "service" },
      ),
    setAccessWindow: (familyId, accessAgeYears) =>
      port.run(
        {
          name: "payments.setAccessWindow",
          exec: async (q) =>
            ((await q.rpc("set_access_window", {
              p_parent_user_id: familyId,
              p_access_age_years: accessAgeYears,
            })) ?? null) as Instant | null,
        },
        { scope: "service" },
      ),
  };
}

export function dbSpineStore(port: DataAccessPort): SpineStore {
  return Object.freeze({ ...reads(port), ...writes(port), ...rpcs(port) });
}
