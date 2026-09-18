// S-N-04 (04 §6.3): area + district from the combobox (already an `areas` row — the FK refuses anything else)
// and a UK mobile (ADR-102: one rule, `normaliseUkMobile`).
import { z } from "zod";
import { LOCALE } from "@/modules/config";
import { normaliseUkMobile } from "@/modules/platform";

export const contactSchema = z.object({
  mobile: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const e164 = normaliseUkMobile(value);
      if (e164 === null) {
        ctx.addIssue({
          code: "custom",
          message: `Please enter a UK mobile number, starting 07 or ${LOCALE.phonePrefix} 7.`,
        });
        return z.NEVER;
      }
      return e164;
    }),
  district: z.string().trim().min(1, "Please pick your area from the list."),
  area: z.string().trim().min(1, "Please pick your area from the list."),
});
