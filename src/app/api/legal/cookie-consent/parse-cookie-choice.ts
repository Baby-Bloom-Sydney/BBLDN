// The one schema between an unauthenticated POST and a consent row (07 §5.1; 01 §4c). Three things it does
// that the route's old `if (!visitor_id || !consent_choice)` did not:
//
//   1. **`visitor_id` in the body is an error, not noise.** Ignoring it silently would leave a stale client
//      posting a value it believes is being used, and would leave the next reader of this file wondering
//      whether the field still means something. It does not: the id is the signed cookie's (`visitor-cookie.ts`).
//   2. **The flags must agree with the choice.** `0004`'s `cookie_consent_records_choice_flags_check` already
//      refuses `accept_all` with analytics off, or `reject_non_essential` with marketing on — but it refuses it
//      as a 500 from a constraint the client cannot see. The same rule at the boundary answers 422 with the
//      reason. ADR-175 (b) is why `reject_non_essential` is a first-class choice here rather than an absence.
//   3. **Unknown keys are refused** (`strict`), because a field we do not read is a field a client thinks we do.
import { z } from "zod";
import { err, ok } from "@/modules/platform";
import { ENUMS } from "@/modules/shared-types";
import type { CookieChoice } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";

export type CookieChoiceInput = {
  readonly choice: CookieChoice;
  readonly analyticsEnabled: boolean;
  readonly marketingEnabled: boolean;
};

const SCHEMA = z
  .object({
    consent_choice: z.enum(ENUMS.cookie_choice),
    analytics_enabled: z.boolean(),
    marketing_enabled: z.boolean(),
  })
  .strict()
  .refine(
    (value) =>
      value.consent_choice !== "accept_all" ||
      (value.analytics_enabled && value.marketing_enabled),
    { message: "accept_all means both categories are on" },
  )
  .refine(
    (value) =>
      value.consent_choice !== "reject_non_essential" ||
      (!value.analytics_enabled && !value.marketing_enabled),
    { message: "reject_non_essential means both categories are off" },
  );

export function parseCookieChoice(body: unknown): Result<CookieChoiceInput> {
  const parsed = SCHEMA.safeParse(body);
  if (!parsed.success)
    return err("VALIDATION", "That cookie choice could not be recorded.", {
      fields: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
  return ok({
    choice: parsed.data.consent_choice,
    analyticsEnabled: parsed.data.analytics_enabled,
    marketingEnabled: parsed.data.marketing_enabled,
  });
}
