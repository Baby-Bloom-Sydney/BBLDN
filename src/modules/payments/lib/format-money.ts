// The one place an amount becomes words a parent reads: locale and currency from `config` (L4 — no currency
// symbol or locale tag is written here), pence to a whole-pound string when the amount is whole.
import { LOCALE } from "@/modules/config";
import type { Money } from "@/modules/purchase-paths";

const PENCE_PER_POUND = 100;

export function formatMoney(money: Money): string {
  const whole = money.pence % PENCE_PER_POUND === 0;
  return new Intl.NumberFormat(LOCALE.locale, {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(money.pence / PENCE_PER_POUND);
}
