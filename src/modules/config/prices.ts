// 01 §3.1 / 03 §5.2 — the F11 key set. Integer minor units, never floats (02 C-5). Stripe price ids come from env.
// Values are the offer's test values per cohort (02 §9 item 29; ADR-092 lets them change without reopening the
// system) — placeholders until the Stripe products exist: @pending:B-01 (£ price, X) / @pending:B-02 (ttl, grace).
export const PRICES = Object.freeze({
  depositPence: 15000, // £150 at cohort commitment, credited against the bill (ADR-085 / 097)
  feePence: 150000, // £1,500 (ADR-096; offer §9 test value) @pending:B-01
  paymentAfterStartDays: 7, // the bill one week after the nanny's start (ADR-094)
  selfServeAppUpfrontPence: 200000, // £2,000 to age 3 (ADR-091) @pending:B-01
  selfServeAppMonthlyPence: 7500, // £75 / month (ADR-091) @pending:B-01
  bundleMonthlyCount: 12, // X monthly payments (ADR-068) — [unverified] placeholder @pending:B-01
  trialDays: 30, // self-serve only (ADR-090 / 093)
  satisfactionWindowDays: 30, // G2 / G3 window from the nanny's first day (ADR-088 / 090)
  accessAgeYears: 3, // access until the child turns 3, all future children (ADR-083 / 084)
  linkTtlDays: 30, // @pending:B-02 (default running now)
  pastDueGraceDays: 7, // @pending:B-02 (default running now)
  /** The four link / checkout presets (02 `payment_link_kind` + `price_preset`; HANDOFF §5.2). `null` = per family. */
  presets: Object.freeze({
    deposit: Object.freeze({ pence: 15000 }),
    "balance-after-week-1": Object.freeze({ pence: null }), // fee − deposit − first-week wages (ADR-094 / 097)
    "self-serve-app": Object.freeze({
      upfrontPence: 200000,
      monthlyPence: 7500,
    }),
    custom: Object.freeze({ pence: null }), // an entered amount (ADR-085)
  }),
});
