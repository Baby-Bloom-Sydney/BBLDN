// An invented DBS certificate number of the right **shape** and no real one.
//
// The shape is config's, not this file's: `VETTING.dbsCertificateNumber` (12 digits — 02 §4.3 "config regex",
// fixed by `2b`, which is why `12.09` was sequenced after it). Matching the shape is the point: every screen,
// schema and guidance line that reads a certificate number has to be exercised by something the product would
// accept.
//
// The **block** is what keeps it from being anybody's certificate: eight leading zeros and a four-digit
// counter, so a seeded number reads as obviously manufactured to anyone who looks at one. `[unverified]`
// whether the DBS could ever issue a number in this block — nothing here rests on it not existing; what the
// seed guarantees is that no number was copied from a real certificate, because none was ever read.
import { VETTING } from "../../../src/modules/config/vetting.ts";

const COUNTER_DIGITS = 4;

export function syntheticDbsNumber(index: number): string {
  const counter = (index % 10 ** COUNTER_DIGITS)
    .toString()
    .padStart(COUNTER_DIGITS, "0");
  const lead = VETTING.dbsCertificateNumber.length - COUNTER_DIGITS;
  return `${"0".repeat(lead)}${counter}`;
}
