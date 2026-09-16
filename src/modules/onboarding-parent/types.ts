// 01 §2.3 + 03 §9.3 — the parent signup surface: UK mobile + promise line, then post-signup routing to the
// call page (`03.36`). The module calls `positions.advance(P-2)`, `matching.autofire` (03 §7.4),
// `areas.isInServiceArea` and `comms.send(welcome-*)`; it owns no stage of its own.
//
// Only the types the foundations state are declared here. The signup action's own shape is the `04 §3`
// journey's (S-P-01) and this unit does not read it — no method is invented. Gap recorded in the README.
import type { TemplateId } from "@/modules/comms";

/** 03 §9.3 funnel row — the `signupSource` prop of `signup.completed`. Values verbatim. */
export type SignupSource =
  | "standard_match"
  | "advanced_match"
  | "cold"
  | "profile"
  | "invite";

/** 03 §8.2 rows 1–3: the three welcome templates this module owns. */
export type ParentWelcomeTemplate = Extract<
  TemplateId,
  "welcome-parent" | "welcome-parent-position" | "welcome-parent-invited"
>;
