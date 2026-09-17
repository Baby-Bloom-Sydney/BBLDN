// S-X-04 assembled for the route (04 §3.1 step 4; 04 §6.1 states): the lead read back (missing → S-X-03), the
// answers → a lead form, `matching.preAuthMatch`, the top nannies joined to their display rows; `total` is the
// count behind "+N more, sign up to see all".
import type { LeadId } from "@/modules/shared-types";
import type { MatchCard, PreAuthPage } from "../types";
import { matching } from "./default-matching";
import { leadFormOf } from "./lead-form-of";

export async function buildPreAuthPage(
  leadId: LeadId | null,
): Promise<PreAuthPage> {
  if (leadId === null) return { kind: "missing-lead" };
  const lead = await matching.getLead(leadId);
  if (!lead.ok) return { kind: "error" };
  if (lead.value === null) return { kind: "missing-lead" };
  const leadForm = leadFormOf(lead.value.answers);
  if (leadForm === null) return { kind: "missing-lead" };

  const [ranked, nannies] = await Promise.all([
    matching.preAuthMatch(leadForm),
    matching.listPublicNannies(),
  ]);
  if (!ranked.ok || !nannies.ok) return { kind: "error" };

  const byId = new Map(nannies.value.map((nanny) => [nanny.nannyId, nanny]));
  const cards: MatchCard[] = [];
  for (const entry of ranked.value) {
    const nanny = byId.get(entry.nannyId);
    if (nanny !== undefined) cards.push({ nanny, ranked: entry });
  }
  return {
    kind: "matches",
    lead: lead.value,
    total: cards.length,
    cards: Object.freeze(cards),
  };
}
