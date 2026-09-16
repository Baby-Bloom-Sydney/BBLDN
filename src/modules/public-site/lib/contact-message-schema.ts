// S-X-23 — the one schema for a contact submission (01 §4a: validate once, at the boundary). Limits are plain
// abuse caps, not a policy; the messages are what a parent reads when a field is wrong.
import { z } from "zod";

const NAME_MAX = 80;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;

export const contactMessageSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please tell us your name.")
    .max(NAME_MAX, "Please use a shorter name."),
  email: z
    .string()
    .trim()
    .email("Please enter the email address we should reply to."),
  role: z.enum(["parent", "nanny", "other"]).catch("other"),
  message: z
    .string()
    .trim()
    .min(MESSAGE_MIN, "Please tell us a little more so we can help.")
    .max(MESSAGE_MAX, "Please keep your message a little shorter."),
});
