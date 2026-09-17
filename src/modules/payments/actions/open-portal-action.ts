"use server";
// S-P-12's lever: the provider's hosted portal, for the card and for stopping the monthly payments. The family
// is the session's, never the caller's; no card detail ever reaches this application (07 §10), which is the
// whole reason the portal is hosted rather than rebuilt here.
//
// Refunds are deliberately **not** here (money-model): Contact Us → a call → the refund by hand. A self-serve
// refund button on a service whose promise is "tell us and we'll make it right" would replace the conversation
// the promise is made of.
import { auth } from "@/modules/auth";
import { toActionResult } from "@/modules/platform";
import type { ClientResult } from "@/modules/platform";
import type { FamilyId, Url } from "@/modules/shared-types";
import { consumeMoneyActionLimit } from "../lib/consume-money-action-limit";
import { payments } from "../lib/default-payments";

export async function openPortalAction(): Promise<
  ClientResult<{ readonly url: Url }>
> {
  const session = await auth.requireRole("parent");
  if (!session.ok) return toActionResult(session);
  const familyId = session.value.userId as string as FamilyId;

  // Same rule as the checkout action: a portal session is a provider call, so a loop is provider cost, and the
  // limiter failing is a refusal rather than a pass (ADR-134).
  const limited = await consumeMoneyActionLimit(familyId, "portal");
  if (limited !== null) return toActionResult(limited);

  const portal = await payments.portal(familyId, {
    kind: "user",
    id: session.value.userId,
    role: "parent",
  });
  return toActionResult(portal);
}
