// 01 §4a — S-N-19 validated once: the funnel's answers without contact (the account holds it) and without the
// account fields — N1's location, residency, DBS and experience, N3's portfolio, N4's bio, in one submission
// (ADR-147: the `/apply` funnel reused, not a second question bank). Composed from the three funnel schemas so
// a rule cannot differ between the two roads.
import { z } from "zod";
import { nannyApplicationSchema } from "./nanny-application-schema";
import { nannyBioSchema } from "./nanny-bio-schema";
import { nannyPortfolioSchema } from "./nanny-portfolio-schema";

const {
  firstName: _f,
  lastName: _l,
  email: _e,
  mobile: _m,
  ...answers
} = nannyApplicationSchema.shape;

export const nannyPortalSchema = z
  .object(answers)
  .extend(nannyBioSchema.shape)
  .and(nannyPortfolioSchema);
