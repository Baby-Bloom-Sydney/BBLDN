// The routes of the screens this module owns (04 §2.1: S-X-02 · S-X-03 · S-X-04 · S-X-05) and the two it sends a
// parent to (S-X-06 signup, S-P-07 the in-app profile). Route paths are app structure, not config (05 §6);
// `public-site`'s register pins the shared ones equal in its routes test, so the two cannot drift apart.
export const FUNNEL_PATHS = Object.freeze({
  results: "/results",
  onboarding: "/matchmaking/onboarding",
  matches: "/matchmaking/results",
  matchmakingSignup: "/matchmaking/signup",
  signup: "/signup",
  parentBrowse: "/parent/browse",
  nannyProfile: "/nannies",
  /** `GET /api/areas` (03 §6.3 — the combobox's source; a thin route over `areas.searchAreas`). */
  areasApi: "/api/areas",
  /** Query keys shared with `public-site` (02.13 funnel-source contract, carried). */
  query: Object.freeze({ lead: "lead", src: "src", nanny: "nanny" }),
});
