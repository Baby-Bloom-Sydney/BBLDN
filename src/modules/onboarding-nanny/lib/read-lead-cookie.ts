// The lead the funnel is working on (ADR-150): the cookie's value, shape-checked before it is looked up (a
// value that is not a uuid is never a lookup), then the row. Every miss is the one `no-lead` refusal — the
// funnel restarts at N1 — and nothing about which miss it was reaches the form.
//
// **That rule is about the form, not about the log** (REVIEW-3 H-2). A refused read and an absent row used to
// share the silence as well as the sentence, and they are not the same event. This gate stands in front of N3,
// N4 and S-X-18, so a `nanny_leads` outage restarts *every* application in flight and orphans the row each
// nanny had already filled in — and the only trace was a drop-off curve indistinguishable from people
// changing their minds. So: the caller still learns nothing, and an operator learns everything. Same shape as
// this module's limiter helpers, which already separate "refused" from "could not answer".
import { err, log, ok } from "@/modules/platform";
import type { LeadId, Result } from "@/modules/shared-types";
import type { NannyFunnelErrorDetails, NannyLead } from "../types";
import { carriedTokenCookie } from "./carried-token-cookie";
import { nannyLeadStore } from "./default-nanny-lead-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_LEAD = err<NannyFunnelErrorDetails>(
  "VALIDATION",
  "Let's start your application again — we couldn't find the one you began.",
  { reason: "no-lead" },
);

export async function readLeadCookie(): Promise<
  Result<NannyLead, NannyFunnelErrorDetails>
> {
  const value = carriedTokenCookie.read("nannyLead");
  if (value === null || !UUID.test(value)) return NO_LEAD;
  const lead = await nannyLeadStore.get(value as LeadId);
  if (!lead.ok) {
    // The lead id is a bearer (ADR-150), so it never reaches the line — only the fact that the read failed.
    log.error("the lead read refused; the funnel restarted instead", {
      module: "onboarding-nanny",
      action: "readLeadCookie",
      alert: "ALERT_PROVIDER_DOWN",
      reason: lead.error.details?.reason ?? lead.error.code,
    });
    return NO_LEAD;
  }
  if (lead.value === null) return NO_LEAD;
  return ok(lead.value);
}
