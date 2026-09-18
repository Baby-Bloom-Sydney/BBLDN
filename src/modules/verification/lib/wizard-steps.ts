// 04 §2.3 S-N-03…S-N-08 — the six steps of `/nanny/onboarding-verification`, in order. Step 0 is the "account
// secured" interstitial (04 §6.3 "step 0 of 5 in the h1"), steps 1–4 the four sections, step 5 processing.
import type { WizardStep } from "../types";

export const WIZARD_STEPS: ReadonlyArray<WizardStep> = Object.freeze([
  {
    index: 0,
    screen: "S-N-03",
    section: null,
    heading: "Your account is secured",
  },
  {
    index: 1,
    screen: "S-N-04",
    section: "contact",
    heading: "Where are you, and how do we reach you?",
  },
  {
    index: 2,
    screen: "S-N-05",
    section: "identity",
    heading: "Confirm your identity",
  },
  {
    index: 3,
    screen: "S-N-06",
    section: "dbs",
    heading: "Your DBS certificate",
  },
  {
    index: 4,
    screen: "S-N-07",
    section: "right-to-work",
    heading: "Your right to work in the UK",
  },
  {
    index: 5,
    screen: "S-N-08",
    section: null,
    heading: "Checking your documents",
  },
]);
