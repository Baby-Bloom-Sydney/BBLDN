// S-N-21 `/nanny/settings` — the tree 04 §6.3 lists and nothing else: **Profile · Account (contact,
// Verification rows, Security) · Linked children · Contact us · Close account** (`03.24` Rejig). Pure.
//
// **The payouts section is dropped (N-2; T-2.5, ADR-027).** There is no commission ledger, no commission badge
// and no figure on this screen, because in London the terms are agreed with her personally by voice and the
// money model has not set a number (D0.2). `onboarding-nanny.my-profile.test.ts` holds that as an assertion
// rather than as an intention.
//
// **Contact details have one writer and it is not a new one.** 04 §6.3 gives Account the contact fields, and
// `update_nanny_profile(p_contact)` (`0021`; ADR-152 (2)) is what S-N-04 and S-N-18's location step already
// call — so this screen posts **S-N-18's own location step** through `saveNannyProfileStepAction`. No second
// action, no second schema, no second rate-limit row, and no way for the two roads to validate differently.
//
// **It never names the hold**, for the reason `nanny-verification-summary.ts` gives.
import { URLS } from "@/modules/config";
import type { VerificationState } from "@/modules/verification";
import type {
  NannyProfile,
  NannySettingsSection,
  NannySettingsView,
} from "../types";
import { PROFILE_STEPS } from "./profile-steps";
import { nannyVerificationSummary } from "./nanny-verification-summary";

const CONTACT_STEP = PROFILE_STEPS.findIndex((step) => step.id === "location");

/**
 * The Linked-children line. An **isolated** nanny is not offered the commission road at all (ADR-147): she has
 * one family and is not in the pool, so an invitation to bring more is an offer she cannot act on — the same
 * rule the hub applies to the same two links.
 */
const childrenSection = (isolated: boolean): NannySettingsSection =>
  Object.freeze(
    isolated
      ? {
          id: "children" as const,
          heading: "Linked children",
          line: "The children you're linked to, their days and what comes next.",
          href: "/nanny/children",
          linkLabel: "Open the app",
        }
      : {
          id: "children" as const,
          heading: "Linked children",
          line: "The children you're linked to — and families you already work for, who you can add here.",
          href: "/nanny/children",
          linkLabel: "Open the app",
        },
  );

function sectionsOf(
  profile: NannyProfile,
  needsHer: boolean,
): ReadonlyArray<NannySettingsSection> {
  return Object.freeze([
    Object.freeze({
      id: "profile" as const,
      heading: "Your profile",
      line: "What a family reads when we introduce you.",
      href: "/nanny/profile",
      linkLabel: "See my profile",
    }),
    Object.freeze({
      id: "account" as const,
      heading: "Your account",
      line: needsHer
        ? "How we reach you, where you are, and the checks — one of them needs another look."
        : "How we reach you, where you are, and the checks.",
      href: "/nanny/verification",
      linkLabel: "See my checks",
    }),
    childrenSection(profile.isIsolated),
    Object.freeze({
      id: "help" as const,
      heading: "Contact us",
      line: "Anything at all — a person reads every message.",
      href: URLS.paths.support,
      linkLabel: "Get in touch",
    }),
    Object.freeze({
      id: "close" as const,
      heading: "Close your account",
      // **This section used to be a link to Contact us, and that was wrong.** The written justification was
      // friction — "a person handles it, so the screen asks her to write to us rather than offering a button
      // that would delete a verification history by accident" — and the first half of it was sound while the
      // second half was already untrue: `0027` made a vetting decision survive an erasure, pseudonymised, so
      // there is no verification history left to delete by accident. 07 §6.1 names this screen and
      // `/parent/settings` as roads that **call the job** (Art 17), and a right that can only be exercised by
      // writing to us is a right behind a queue. The friction stays where it belongs — she types DELETE, and the
      // screen tells her what is kept before she does — and asking a person is still offered below it.
      line: "You can delete it here. We will show you what we have to keep, and why, before you confirm.",
      href: URLS.paths.support,
      linkLabel: "Or ask a person to do it for you",
    }),
  ]);
}

export function nannySettingsView(
  profile: NannyProfile,
  state: VerificationState,
): NannySettingsView {
  const verification = nannyVerificationSummary(state);
  return Object.freeze({
    firstName: profile.firstName,
    email: profile.email,
    sections: sectionsOf(profile, verification.needsHer),
    contact: Object.freeze({
      mobile: profile.mobile ?? null,
      district: profile.district ?? null,
      area: profile.area ?? null,
    }),
    contactStepIndex: CONTACT_STEP,
    verificationRows: verification.rows,
    verification,
  });
}
