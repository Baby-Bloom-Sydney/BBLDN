// onboarding-nanny connector (01 §2.3) — the apply funnel, invited-nanny isolation and apply-from-portal
// (ADR-017). It may import `verification`, `call-layer` and the service modules; it never imports
// `scheduling` (03 §3.6 R3).
//
// **Types only in this unit** — the apply funnel's actions and screens are the `04 §4` journey's. See
// README "Gaps".
export type * from "./types";
