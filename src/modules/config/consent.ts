// 01 §3.1 — the consent **cadence**, once (FATE `10.18`; ADR-174; L-009 `3g`).
//
// This is a product setting and not a legal one, and the distinction is the reason it lives here rather than in
// `legal.ts` beside `erasureRetains`. The fate table says it in as many words: *"the 12-month cadence is a
// product setting, not a UK statutory rule"*. No UK instrument requires a consent to be re-taken annually —
// ADR-174's whole argument is that a consent expires when the **words** change, not when a year passes. What
// the year buys is the **check**: a scheduled moment at which we compare what she signed with what the document
// now says, and either carry it forward (recorded) or put the changed words back in front of her.
//
// It is also not a retention window, so it is not in `SECURITY.retention` (07 §6.2): nothing is deleted or
// nulled when this elapses. Mis-filing it there would have made a product dial look like a compliance one, and
// the next person to shorten it would have thought they were touching a statutory number.
export const CONSENT = Object.freeze({
  /** How long after a person's newest row for a purpose the annual **check** is due (ADR-174). */
  renewalCheckMonths: 12,
  /**
   * How many subjects one sweep run handles per purpose. A cron read with no ceiling is how a job that was fine
   * for a year becomes an incident in a single run; the leftovers are still due tomorrow, because "due" is
   * computed from the newest row rather than from a cursor a failed run could lose.
   */
  renewalSweepLimit: 500,
  /**
   * How long before a per-child consent reaches `renewalCheckMonths` the surface starts calling it
   * "nearing expiry" — the window in which `3b`'s renewal modal fires. A product dial for the same reason as
   * the cadence above: nothing expires here, it is when we start asking.
   */
  renewalNoticeDays: 7,
});
