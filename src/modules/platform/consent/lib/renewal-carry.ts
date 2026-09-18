// The shape of a carry-forward record (**ruling 5.2**, L-009 `3c`).
//
// A carry is deliberately NOT a new agreement: it belongs to the agreement the user already signed, and the
// checkpoint is what tells the two apart — a signature says *she accepted these words*, a carry says *we checked
// on this date, the words had not changed, and her existing agreement stands*. Without the row the two states
// "no renewal was needed" and "the renewal never ran" are indistinguishable a year later, which is exactly the
// question an accountability request asks. One frozen value, so the id and the wording cannot drift apart.
export const RENEWAL_CARRY = Object.freeze({
  checkpointId: "annual_renewal_carry_forward",
  checkpointText:
    "Annual review: this document has not changed since you accepted it, so your existing agreement was carried forward.",
});
