// 01 §2.3 + 03 §9.3 / §10.1 — the public pages: home, about, pricing, contact, browse, nanny profile and the
// legal pages. `public-site` owns the browse **Connect** action (K-1) through the `connections` stage-model
// connector, sends the contact form through `comms`, and never imports `scheduling` (03 §3.6 R3).
//
// Only the types the foundations state are declared here; the pages themselves are the `04` inventory's.
import type { TemplateId } from "@/modules/comms";

/** 03 §9.3 funnel row — the `surface` prop of `results.viewed`. Values verbatim. */
export type ResultsSurface = "quick" | "results" | "matches" | "browse";

/** 03 §8.2 rows 37–40: the contact-form templates this surface sends, `replyTo` = the submitter. */
export type ContactTemplate = Extract<
  TemplateId,
  "contact-request" | "contact-request-public"
>;
