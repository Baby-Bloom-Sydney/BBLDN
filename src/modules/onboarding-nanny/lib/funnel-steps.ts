// 04 §4.1 rows 1–7 — the funnel's pages in order, per mode. `/apply` (S-X-15…S-X-19) asks everything; the
// portal (S-N-19, ADR-147) is the same funnel without contact and account, because the account already exists
// and holds those. Each step names its screen id so the h1 reads "step n of N" for the right screen.
import type { FunnelStep, NannyFunnelMode } from "../types";

const N1: ReadonlyArray<FunnelStep> = [
  { id: "location", screen: "S-X-15", heading: "Where in London are you?" },
  {
    id: "residency",
    screen: "S-X-15",
    heading: "Your right to work in the UK",
  },
  {
    id: "credentials",
    screen: "S-X-15",
    heading: "Your Enhanced DBS certificate",
  },
  { id: "experience", screen: "S-X-15", heading: "Your experience" },
];

const CONTACT: FunnelStep = {
  id: "contact",
  screen: "S-X-15",
  heading: "How can we reach you?",
};

const REST: ReadonlyArray<FunnelStep> = [
  { id: "interstitial", screen: "S-X-16", heading: "Application received" },
  { id: "portfolio", screen: "S-X-17", heading: "The work you're looking for" },
  { id: "review", screen: "S-X-18", heading: "Your profile" },
];

const ACCOUNT: FunnelStep = {
  id: "account",
  screen: "S-X-19",
  heading: "Create your account",
};

export const FUNNEL_STEPS: Readonly<
  Record<NannyFunnelMode, ReadonlyArray<FunnelStep>>
> = Object.freeze({
  apply: Object.freeze([...N1, CONTACT, ...REST, ACCOUNT]),
  portal: Object.freeze([...N1, ...REST]),
});
