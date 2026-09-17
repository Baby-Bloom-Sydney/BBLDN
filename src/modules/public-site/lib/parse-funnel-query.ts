// 02.13 — the funnel-source contract, carried: `?src=std|adv` threads where a parent came from (03 §9.3
// `signupSource`: standard_match · advanced_match) and `?lead=<uuid>` the advanced-wizard lead, from S-X-02 /
// S-X-04 through S-X-11 and the Connect to signup. Anything else is `null`; never thrown.
import type { LeadId } from "@/modules/shared-types";
import type { FunnelQuery } from "../types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const one = (
  value: string | ReadonlyArray<string> | undefined,
): string | null => (typeof value === "string" ? value : null);

export function parseFunnelQuery(
  params: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
): FunnelQuery {
  const src = one(params.src);
  const lead = one(params.lead);
  return Object.freeze({
    src: src === "std" || src === "adv" ? src : null,
    lead: lead !== null && UUID.test(lead) ? (lead as LeadId) : null,
  });
}
