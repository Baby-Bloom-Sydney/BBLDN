// The one server read behind S-P-10 / S-P-11 / S-P-12: who is signed in → her standing → the view. One read,
// one shape; each route decides only where to send a parent who is not signed in (05 §7 rule 5).
//
// The `familyId` is the session's own user id and nothing else is trusted from the request — a `?family=` on a
// money screen would be someone else's standing, and `getAccess` runs `session`-scoped so RLS would refuse it
// anyway. Belt and braces, because this is the read every paywall in the app stands on.
//
// A failed read is **not** rendered as "nothing to pay": `payments` failing closed must reach the screen as a
// failure, or an outage reads to a paying family as a closed account.
import { auth } from "@/modules/auth";
import type { FamilyId } from "@/modules/shared-types";
import { payments } from "./default-payments";
import { moneyPageView } from "./money-page-view";
import type { MoneyPageLoad } from "../types";

export async function loadMoneyPage(): Promise<MoneyPageLoad> {
  const session = await auth.requireRole("parent");
  if (!session.ok) return { kind: "signed-out" };
  const familyId = session.value.userId as string as FamilyId;
  const state = await payments.getAccess(familyId);
  if (!state.ok) return { kind: "failed" };
  return {
    kind: "standing",
    familyId,
    state: state.value,
    view: moneyPageView(state.value),
  };
}
