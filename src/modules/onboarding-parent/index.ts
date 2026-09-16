// onboarding-parent connector (01 §2.3) — signup with the UK mobile + promise line and the post-signup route
// to the call page. It may import `call-layer`, `positions`, `matching` and the service modules; it never
// imports `scheduling` (03 §3.6 R3) — the slot picker is `call-layer`'s.
//
// **Types only in this unit.** The signup action, its screens and its copy are the `04 §3` journey's, which
// this unit does not read; inventing a connector method here would be inventing a business rule. See
// README "Gaps".
export type * from "./types";
