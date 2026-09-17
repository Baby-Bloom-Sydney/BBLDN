// S-X-02 assembled for the route (04 §3.1 step 2; 04 §6.1 states): the district → an area through `areas`
// (03 §6.3 rule 5: the table is the service area; an unknown district is the no-match stop state, never an
// error); days × parts → the schedule; `matching.quickMatch`; the top nannies joined to their display rows.
import { areas } from "@/modules/areas";
import type { AreaRef } from "@/modules/scoring";
import type { MatchCard, QuickMatchInput, QuickMatchPage } from "../types";
import { matching } from "./default-matching";
import { quickMatchSchedule } from "./quick-match-schedule";

export async function buildQuickMatchPage(
  input: QuickMatchInput,
): Promise<QuickMatchPage> {
  const area = await areas.lookupArea(input.district);
  if (!area.ok)
    return area.error.code === "INTERNAL"
      ? { kind: "error" }
      : { kind: "no-match", area: null };
  const ref: AreaRef = { area: area.value.name, district: area.value.district };

  const [result, nannies] = await Promise.all([
    matching.quickMatch(quickMatchSchedule(input), ref),
    matching.listPublicNannies(),
  ]);
  if (!result.ok || !nannies.ok) return { kind: "error" };
  if (result.value.total === 0) return { kind: "no-match", area: ref };

  const byId = new Map(nannies.value.map((nanny) => [nanny.nannyId, nanny]));
  const cards: MatchCard[] = [];
  for (const ranked of result.value.top) {
    const nanny = byId.get(ranked.nannyId);
    if (nanny !== undefined) cards.push({ nanny, ranked });
  }
  return {
    kind: "matches",
    area: ref,
    total: result.value.total,
    cards: Object.freeze(cards),
  };
}
