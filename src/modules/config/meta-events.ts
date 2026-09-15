// 01 §3.1 — the event-name → Meta standard-event map for the CAPI / pixel consumer (03 §9.5 day-one map; ADR-055;
// consent-gated — 01 §7). `contentCategory` is the one-dataset split (memory: content_category by audience) —
// values [unverified] until the London dataset exists (B-32).
export const META_EVENTS = Object.freeze({
  map: Object.freeze({
    "position.created": "SubmitApplication", // the primary conversion (ADR-055)
    "signup.completed": "CompleteRegistration",
    "results.viewed": "ViewContent",
    "bundle.paid": "Purchase",
    "trial.started": "StartTrial",
  }),
  contentCategory: Object.freeze({ parent: "parent", nanny: "nanny" }),
});
