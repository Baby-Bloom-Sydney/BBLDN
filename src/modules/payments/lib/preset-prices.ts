// The presets `PRICES` states an amount for, rendered as 03 §5.2's `Price` (L4 — never a literal). The two
// per-family presets (`balance-after-week-1`, `custom`) are not here: their amount is computed from the family's
// own row by the inside. Shared by the inside and by `stubPayments`, so the two can never disagree.
import { LOCALE, PRICES } from "@/modules/config";
import type { Money, PlanShape, Price } from "@/modules/purchase-paths";

const money = (pence: number): Money => ({ pence, currency: LOCALE.currency });

export function presetPrices(): ReadonlyArray<Price> {
  const upfront: PlanShape = { kind: "upfront" };
  const monthly: PlanShape = {
    kind: "instalments",
    count: PRICES.bundleMonthlyCount,
  };
  return Object.freeze([
    {
      preset: "deposit" as const,
      shape: upfront,
      perPayment: money(PRICES.depositPence),
      total: money(PRICES.depositPence),
      label: "price.deposit",
    },
    {
      preset: "self-serve-app" as const,
      shape: upfront,
      perPayment: money(PRICES.selfServeAppUpfrontPence),
      total: money(PRICES.selfServeAppUpfrontPence),
      label: "price.self-serve-app.upfront",
    },
    {
      preset: "self-serve-app" as const,
      shape: monthly,
      perPayment: money(PRICES.selfServeAppMonthlyPence),
      total: money(PRICES.selfServeAppMonthlyPence * PRICES.bundleMonthlyCount),
      label: "price.self-serve-app.monthly",
    },
  ]);
}
