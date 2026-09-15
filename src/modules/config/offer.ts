// 01 §3.1 — the offer's system values (02 §4.5, 03 §5.2; TARGET/offer is the source of truth, ADR-092).
// No `nannyBonusPence` (ADR-099). Caps per promise are @pending (02 §9 item 30; 05 §11.2 item 21).
export const OFFER = Object.freeze({
  firstWeekMaxHours: 40, // ADR-100
  firstWeekMaxRatePence: 1500, // £15 / h (ADR-100)
  usageLowThreshold: 1, // posts / child / week — [unverified] @pending: 02 §9 item 31 / 06 §13 O-18
  netPerPlacementFloorPence: 100000, // £1,000 — a watch, not a gate (ADR-096 / 100)
  guarantees: Object.freeze({
    G1: Object.freeze({ windowDays: 14, provenWindowDays: 7, capPence: null }), // "a nanny you'll love within 14 days" — pays her first week (ADR-088) @pending caps
    G2: Object.freeze({ refundWindowDays: 30, capPence: null }), // 30-day full refund, keep the app (ADR-088 / 090)
    G3: Object.freeze({ capPence: 150000 }), // wages reimbursed up to the fee (ADR-088) @pending caps
    G4: Object.freeze({ capWeeks: 4, startAfterPlacements: 20 }), // cohort test after ≥ 20 placements (ADR-088)
    G5: Object.freeze({}), // we keep working until it's right (ADR-088)
  }),
});
