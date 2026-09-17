// 01 §4a — validated once, at the boundary. Field messages are what the error summary reads out (04 §6.1 S-X-05:
// "UK-mobile error · error summary takes focus"), so each names the field in plain words. The password floor is
// `SECURITY.password.minLength` (07 §7 rule 6); `auth.signUp` checks it again, so the rule cannot differ between
// callers. The invite token is Sydney's `XXXX-XXXX` shape (memory: invite token format), never echoed otherwise.
import { z } from "zod";
import { LOCALE, SECURITY } from "@/modules/config";
import { normaliseUkMobile } from "./normalise-uk-mobile";

const INVITE_TOKEN = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCES = [
  "standard_match",
  "advanced_match",
  "cold",
  "profile",
  "invite",
] as const;

export const parentSignupSchema = z
  .object({
    firstName: z.string().trim().min(1, "Please enter your first name."),
    lastName: z.string().trim().min(1, "Please enter your last name."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Please enter the email address you want to use."),
    mobile: z
      .string()
      .trim()
      .transform((value, ctx) => {
        const e164 = normaliseUkMobile(value);
        if (e164 === null)
          ctx.addIssue({
            code: "custom",
            message: `Please enter a UK mobile number, starting 07 or ${LOCALE.phonePrefix} 7.`,
          });
        return e164 ?? "";
      }),
    password: z
      .string()
      .min(
        SECURITY.password.minLength,
        `Your password needs to be at least ${SECURITY.password.minLength} characters.`,
      ),
    confirmPassword: z.string(),
    consent: z.literal("on", {
      error: "Please tick to agree to the client terms and privacy policy.",
    }),
    source: z.enum(SOURCES).catch("cold"),
    leadId: z.string().regex(UUID).optional().catch(undefined),
    inviteToken: z.string().regex(INVITE_TOKEN).optional().catch(undefined),
    nannyId: z.string().regex(UUID).optional().catch(undefined),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "The two passwords don't match.",
    path: ["confirmPassword"],
  });
