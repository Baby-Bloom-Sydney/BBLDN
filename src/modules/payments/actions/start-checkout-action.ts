"use server";
// S-P-11's one lever: the signed-in parent takes the self-serve app in the shape she chose (03 §5.4.2;
// ADR-091). The role gate resolves the actor and the family from the **session** — a caller-supplied family id
// on a money action is someone else's checkout — and `createCheckout` refuses anything but her own row again
// underneath, which is the belt to this braces.
//
// The only thing the form carries is the shape, and it is validated against the presets `config` states rather
// than trusted: a posted `count` is a number a stranger chose, and it decides how many times a card is charged.
// Anything that is not one of the offered shapes is `E_PLAN_INVALID`, never a guess.
import { PRICES } from "@/modules/config";
import { auth } from "@/modules/auth";
import { toActionResult } from "@/modules/platform";
import type { ClientResult } from "@/modules/platform";
import type { PlanShape } from "@/modules/purchase-paths";
import type { FamilyId, Url } from "@/modules/shared-types";
import { consumeMoneyActionLimit } from "../lib/consume-money-action-limit";
import { payments } from "../lib/default-payments";
import { fail } from "../lib/fail";

export type CheckoutShape = "upfront" | "instalments";

export async function startCheckoutAction(input: {
  readonly shape: string;
  readonly count: number;
}): Promise<ClientResult<{ readonly url: Url }>> {
  const session = await auth.requireRole("parent");
  if (!session.ok) return toActionResult(session);
  const familyId = session.value.userId as string as FamilyId;

  // Before the shape is even read: a refused attempt should cost the provider nothing (07 §8; ADR-134 — a money
  // action refuses when the limiter cannot answer, it never fails open).
  const limited = await consumeMoneyActionLimit(familyId, "checkout");
  if (limited !== null) return toActionResult(limited);

  const monthly = input.shape === "instalments";
  const upfront = input.shape === "upfront";
  if (!monthly && !upfront)
    return toActionResult(fail("E_PLAN_INVALID", "Pick one of the two"));
  if (monthly && input.count !== PRICES.bundleMonthlyCount)
    return toActionResult(fail("E_PLAN_INVALID", "Pick one of the two"));

  const plan: PlanShape = monthly
    ? { kind: "instalments", count: PRICES.bundleMonthlyCount }
    : { kind: "upfront" };

  const checkout = await payments.createCheckout(
    familyId,
    "self-serve-app",
    plan,
    { kind: "user", id: session.value.userId, role: "parent" },
  );
  return toActionResult(checkout);
}
