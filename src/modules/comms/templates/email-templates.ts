// The template files that exist today, keyed by id (03 §8.1 "one file per template").
//
// **It is deliberately partial and deliberately short.** 03 §8.2 closes the *id* union at 48; the *files* land
// with the units that fire them (03 §8.3), and 4a is the sender, not the copy. What is here is what 4a owns:
// the contact form's message (`08.17`), the operator's reply (`08.17`), the operator's free-form message
// (`08.18`), the commission-call notice `call-layer` already fires (`08.18`), and the test send (`08.19`).
//
// Every other id renders `INTERNAL { reason: 'template-schema' }` — loud, and in the one place a missing file
// can be seen (`create-template-renderer.ts`). That is the honest state: the journey templates are owed, and a
// placeholder body would hide which ones.
import type { EmailTemplates } from "../types";
import { adminCommissionBookingTemplate } from "./admin-commission-booking";
import { adminContactTemplate } from "./admin-contact";
import { adminTestTemplate } from "./admin-test";
import { contactRequestPublicTemplate } from "./contact-request-public";
import { supportReplyTemplate } from "./support-reply";

export const EMAIL_TEMPLATES: EmailTemplates = Object.freeze({
  "admin-commission-booking": adminCommissionBookingTemplate,
  "admin-contact": adminContactTemplate,
  "admin-test": adminTestTemplate,
  "contact-request-public": contactRequestPublicTemplate,
  "support-reply": supportReplyTemplate,
});
