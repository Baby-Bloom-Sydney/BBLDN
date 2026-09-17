// ADR-126 / 04 §3.3 (d): the pure half of the Connect entry point. A guest (no account / no position) goes to
// S-X-03's first question with the nanny remembered (04 §3.2 path D); a signed-in parent goes to S-P-07, where
// the in-app Connect lives (04 §6.1 S-X-11 exits); any other role to its own dashboard through `auth`'s table.
import { ROUTE_MAP } from "@/modules/auth";
import type { ConnectDecision, ConnectInput } from "../types";
import { FUNNEL_PATHS } from "./funnel-paths";

export function connectDecision(
  input: Pick<ConnectInput, "nannyId" | "session" | "leadId">,
): ConnectDecision {
  const { session } = input;
  if (session === null) {
    const query = new URLSearchParams({
      [FUNNEL_PATHS.query.nanny]: input.nannyId,
    });
    if (input.leadId !== null) query.set(FUNNEL_PATHS.query.lead, input.leadId);
    return { kind: "redirect", to: `${FUNNEL_PATHS.onboarding}?${query}` };
  }
  if (session.role === "parent")
    return {
      kind: "redirect",
      to: `${FUNNEL_PATHS.parentBrowse}/${encodeURIComponent(input.nannyId)}`,
    };
  return { kind: "redirect", to: ROUTE_MAP.dashboards[session.role] };
}
