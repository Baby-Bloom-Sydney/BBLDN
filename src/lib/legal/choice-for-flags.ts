// Which `cookie_choice` a pair of toggles is (L-009 `3g`). One definition, used by the banner and the preference
// screen, because `0004`'s `cookie_consent_records_choice_flags_check` and `parse-cookie-choice.ts` both refuse a
// choice that disagrees with its flags — and two surfaces each deciding the mapping for themselves is how one of
// them ends up posting `accept_all` with analytics off and getting a 422 nobody expected.
import type { CookieChoice } from "@/modules/platform";

export function choiceForFlags(
  analyticsEnabled: boolean,
  marketingEnabled: boolean,
): CookieChoice {
  if (analyticsEnabled && marketingEnabled) return "accept_all";
  if (!analyticsEnabled && !marketingEnabled) return "reject_non_essential";
  return "custom";
}
