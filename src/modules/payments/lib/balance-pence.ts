// ADR-094 / 097: the bill = fee − the deposit paid − the first week's wages, never below zero. Every input is
// integer pence (01 §4c rule 3); the fee is `PRICES.feePence` and is passed in so the rule is testable per cohort.
export function balancePence(
  feePence: number,
  depositPaidPence: number,
  firstWeekWagesPence: number,
): number {
  return Math.max(0, feePence - depositPaidPence - firstWeekWagesPence);
}
