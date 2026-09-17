// ADR-102 (B-12 closed): mobiles are UK only, stored E.164 under CHECK C-7 with the country prefix from config
// (`LOCALE.phonePrefix`, L4). Accepts the ways a London parent types her number — national `07…`, the prefix
// with or without `+`, the `00` international form, with spaces, dashes or brackets — and returns the one stored
// form, or `null` when it is not a UK mobile. A UK mobile is the prefix, then `7` and nine more digits.
import { LOCALE } from "@/modules/config";
import type { E164 } from "@/modules/shared-types";

const UK_MOBILE = /^7\d{9}$/;
const PREFIX = LOCALE.phonePrefix;
const COUNTRY_CODE = PREFIX.replace(/^\+/, "");
const INTERNATIONAL_LENGTH = COUNTRY_CODE.length + 10;

function nationalPart(digits: string): string {
  if (digits.startsWith(PREFIX)) return digits.slice(PREFIX.length);
  if (digits.startsWith(`00${COUNTRY_CODE}`))
    return digits.slice(COUNTRY_CODE.length + 2);
  if (digits.startsWith(COUNTRY_CODE) && digits.length === INTERNATIONAL_LENGTH)
    return digits.slice(COUNTRY_CODE.length);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function normaliseUkMobile(raw: string): E164 | null {
  const national = nationalPart(raw.replace(/[\s\-().]/g, ""));
  return UK_MOBILE.test(national) ? (`${PREFIX}${national}` as E164) : null;
}
