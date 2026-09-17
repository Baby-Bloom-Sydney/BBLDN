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
import type { DataAccessPort } from "@/modules/auth";
import { ok } from "@/modules/platform";
import type { Email, FamilyId, Instant, Uuid } from "@/modules/shared-types";
import { isDuplicateKeyError } from "./is-duplicate-key-error";
import type { SpineRow, SpineStore } from "./spine-store";

const EVENT_UNIQUE = "payment_events_provider_event_key";

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
): Pick<
  SpineStore,
  "insertSpine" | "updateSpine" | "insertEvent" | "stampEvent"
> {
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
    insertEvent: async (row) => {
      const inserted = await port.run(
        {
          name: "payments.insertEvent",
          exec: async (q) =>
            (await q.from("payment_events").insert(row)).id as Uuid,
        },
        { scope: "service" },
      );
      if (inserted.ok) return ok({ kind: "inserted", id: inserted.value });
      if (isDuplicateKeyError(inserted.error, EVENT_UNIQUE))
        return ok({ kind: "duplicate" });
      return inserted;
    },
    stampEvent: (id, patch) =>
      port.run(
        {
          name: "payments.stampEvent",
          exec: async (q) => {
            await q.from("payment_events").update(id, patch);
          },
        },
        { scope: "service" },
      ),
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
