// The lead the funnel is working on (ADR-150): the cookie's value, shape-checked before it is looked up (a
// value that is not a uuid is never a lookup), then the row. Every miss is the one `no-lead` refusal — the
// funnel restarts at N1 — and nothing about which miss it was reaches the form.
import { err, ok } from "@/modules/platform";
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

export async function readLeadCookie(): Promise<Result<NannyLead, NannyFunnelErrorDetails>> {
  const value = carriedTokenCookie.read("nannyLead");
  if (value === null || !UUID.test(value)) return NO_LEAD;
  const lead = await nannyLeadStore.get(value as LeadId);
  if (!lead.ok || lead.value === null) return NO_LEAD;
  return ok(lead.value);
}
