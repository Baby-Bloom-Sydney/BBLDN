// 01 §4a — the account form validated once (S-X-19 / S-X-07). The `/apply` road carries only the password
// and the AGR-02 tick (name and email are the lead's — asked once, 04 §6.3 a11y-18); the invite road asks
// the name and the email too. The password floor is `SECURITY.password.minLength`; `auth.signUp` checks it
// again so the rule cannot differ between callers. An unknown `path` is `/apply`, never a refusal.
import { z } from "zod";
import { SECURITY } from "@/modules/config";

const person = z.object({
  firstName: z.string().trim().min(1, "Please enter your first name."),
  lastName: z.string().trim().min(1, "Please enter your last name."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter the email address you want to use."),
});

const account = z.object({
  password: z
    .string()
    .min(
      SECURITY.password.minLength,
      `Your password needs to be at least ${SECURITY.password.minLength} characters.`,
    ),
  confirmPassword: z.string(),
  consent: z.literal("on", {
    error: "Please tick to agree to the professional terms and privacy policy.",
  }),
});

const passwordsMatch = { message: "The two passwords don't match.", path: ["confirmPassword"] };

const road = z.discriminatedUnion("path", [
  z
    .object({ path: z.literal("apply") })
    .extend(account.shape)
    .refine((data) => data.password === data.confirmPassword, passwordsMatch),
  z
    .object({ path: z.literal("invite") })
    .extend(person.shape)
    .extend(account.shape)
    .refine((data) => data.password === data.confirmPassword, passwordsMatch),
]);

/** The raw `path` is defaulted before the union looks at it: an unknown road is `/apply`, never a refusal. */
export const nannySignupSchema = z.preprocess(
  (raw) =>
    typeof raw === "object" && raw !== null
      ? { ...raw, path: (raw as { path?: unknown }).path === "invite" ? "invite" : "apply" }
      : raw,
  road,
);
