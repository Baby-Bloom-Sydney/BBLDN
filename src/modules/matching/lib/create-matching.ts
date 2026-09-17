// The inside (03 §7.4 / §10.1; Phase 1 `1b`): the candidate set loaded from `nanny_public` through `auth`'s port and
// handed to `scoring`, which re-checks every exclusion; the lead saved and read through the same port at
// service scope (`parent_leads` is service-role only — 02 §4.7; the named use is in the README); the Connect
// entry point of ADR-126. `1e` added the `autofire` pre-check (03 §7.4) over the same candidate pool;
// `resultsFor` stays `not-built` and answers so rather than pretending.
import type { Auth } from "@/modules/auth";
import { Events, err, ok } from "@/modules/platform";
import { scoring } from "@/modules/scoring";
import type { LeadId, NannyId, Result, Uuid } from "@/modules/shared-types";
import type { Matching, ParentLead, SaveLeadInput } from "../types";
import { autofire } from "./autofire";
import { connectDecision } from "./connect-decision";
import { fromLeadRow } from "./from-lead-row";
import type { ParentLeadRow } from "./from-lead-row";
import { toLeadRow } from "./to-lead-row";
import { loadPublicNannies } from "./load-public-nannies";
import { toCandidate } from "./to-candidate";

export type MatchingDeps = {
  readonly auth: Auth;
  /** 03 §7.5 — which distance provider boot wired, for `precheck.fired.providerKind`. */
  readonly distanceKind?: Parameters<typeof autofire>[0]["distanceKind"];
  /**
   * 03 §7.4's `precheck-nanny` batch, handed in at boot — 01 §2.3 gives `matching` no arrow to `comms`, so the
   * send arrives as a port rather than an import (ADR-136; see `PrecheckBlast`).
   */
  readonly blast?: Parameters<typeof autofire>[0]["blast"];
};

const NOT_BUILT = err("INTERNAL", "Not available yet", {
  reason: "not-built" as const,
});

export function createMatching(deps: MatchingDeps): Matching {
  const { auth } = deps;

  const pool = async () => {
    const nannies = await loadPublicNannies(auth);
    return nannies.ok ? ok(nannies.value.map(toCandidate)) : nannies;
  };

  const readLeads = async (): Promise<Result<ReadonlyArray<ParentLeadRow>>> =>
    auth.data.run(
      {
        name: "matching.readParentLeads",
        exec: (q) => q.from("parent_leads").select(),
      },
      { scope: "service" },
    );

  const getLead = async (
    leadId: LeadId,
  ): Promise<Result<ParentLead | null>> => {
    const rows = await readLeads();
    if (!rows.ok) return rows;
    // The memory driver appends an `update` as a new row, so the **last** row with the id is the current one.
    const row = [...rows.value].reverse().find((entry) => entry.id === leadId);
    return ok(row === undefined ? null : fromLeadRow(row));
  };

  const saveLead = async (input: SaveLeadInput): Promise<Result<void>> => {
    const existing = await getLead(input.id);
    if (!existing.ok) return existing;
    const row = toLeadRow(input);
    const written = await auth.data.run(
      {
        name: "matching.saveParentLead",
        exec: (q) =>
          existing.value === null
            ? q.from("parent_leads").insert(row)
            : // the client-minted lead id is the row key (02 §4.7); `update` is keyed by `Uuid` at the port seam
              q.from("parent_leads").update(input.id as string as Uuid, row),
      },
      { scope: "service" },
    );
    if (!written.ok) return written;
    // 03 §9.3 funnel events, server-emitted; a wizard has no signed-in actor yet.
    const actor = { kind: "anonymous" as const };
    if (existing.value === null)
      await Events.emit({
        name: "lead.created",
        actor,
        props: { leadId: input.id },
      });
    if (input.completed && existing.value?.completed !== true)
      await Events.emit({
        name: "wizard.completed",
        actor,
        props: { leadId: input.id },
      });
    return ok(undefined);
  };

  return Object.freeze({
    quickMatch: async (availability, district) => {
      const list = await pool();
      if (!list.ok) return list;
      return scoring.quickMatch(availability, district, list.value);
    },
    preAuthMatch: async (leadForm) => {
      const list = await pool();
      if (!list.ok) return list;
      return scoring.preAuthMatch(leadForm, list.value);
    },
    resultsFor: async () => NOT_BUILT,
    autofire: autofire({
      pool,
      ...(deps.distanceKind === undefined
        ? {}
        : { distanceKind: deps.distanceKind }),
      ...(deps.blast === undefined ? {} : { blast: deps.blast }),
    }),
    listPublicNannies: () => loadPublicNannies(auth),
    getPublicNanny: async (nannyId: NannyId) => {
      const nannies = await loadPublicNannies(auth);
      if (!nannies.ok) return nannies;
      return ok(
        nannies.value.find((nanny) => nanny.nannyId === nannyId) ?? null,
      );
    },
    saveLead,
    getLead,
    connect: async (input) => ok(connectDecision(input)),
  });
}
