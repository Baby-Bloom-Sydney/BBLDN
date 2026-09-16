// 03 §6.2 `normaliseDistrict` — trim, upper-case, strip a pasted inward code ("SW4 7AA" → "SW4"); `null` when
// the input is not an outward-code shape. Rule 1 of 03 §6.3: a pasted inward code is discarded, never stored.
import type { PostcodeDistrict } from "../types";

/** UK outward code: one or two letters, one or two digits, an optional final letter (e.g. "E1", "SW4", "EC2A"). */
const OUTWARD_CODE = /^[A-Z]{1,2}\d{1,2}[A-Z]?$/u;

export function normaliseDistrict(raw: string): PostcodeDistrict | null {
  const outward = raw.trim().toUpperCase().split(/\s+/u)[0] ?? "";
  return OUTWARD_CODE.test(outward) ? outward : null;
}
