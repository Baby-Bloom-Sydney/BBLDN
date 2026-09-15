// 03 §9.3 Funnel (8): `public-site` · `matching` · `onboarding-parent`. `signupSource` is the contract's union
// (03 §9.3), not 02's `signup_source` enum — raised as a foundations gap in the S3 PROGRESS entry.
import { z } from "zod";
import { PROPS_PARTS as P } from "../lib/props-parts";
import { piiSafeString } from "../lib/pii-safe-string";

const PATH_MAX = 512;

export const FUNNEL_EVENT_SCHEMAS = Object.freeze({
  visit: P.props({ path: piiSafeString.max(PATH_MAX) }),
  "quick-match.run": P.props({
    areaDistrict: P.district.optional(),
    days: P.count.optional(),
    matchCount: P.count.optional(),
  }),
  "lead.created": P.props({ leadId: P.id }),
  "wizard.step": P.props({
    leadId: P.id.optional(),
    step: P.count.optional(),
    stepCount: P.count.optional(),
  }),
  "wizard.completed": P.props({
    leadId: P.id,
    step: P.count.optional(),
    stepCount: P.count.optional(),
  }),
  "results.viewed": P.props({
    surface: z.enum(["quick", "results", "matches", "browse"]),
    resultCount: P.count,
    total: P.count.optional(),
  }),
  "profile.viewed": P.props({ nannyId: P.id }),
  "signup.completed": P.props({
    role: z.enum(["parent", "nanny"]),
    signupSource: z.enum([
      "standard_match",
      "advanced_match",
      "cold",
      "profile",
      "invite",
    ]),
  }),
});
