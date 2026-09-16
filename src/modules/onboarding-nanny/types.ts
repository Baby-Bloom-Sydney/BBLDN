// 01 §2.3 + 03 §9.3 — the nanny apply funnel, registration, profile completeness and the invited-nanny
// isolation / apply-from-portal pair (ADR-017, ADR-058). S-N-02 books the commission call through
// `call-layer.openNannyCall` — **never** `scheduling` (03 §3.6 R3).
//
// Only the types the foundations state are declared here; the apply action's shape is the `04 §4` journey's.
import type { TemplateId } from "@/modules/comms";

/** 03 §9.3 nanny-onboarding row — the `path` prop of `nanny.applied` (ADR-017 / 058). Values verbatim. */
export type NannyApplyPath = "apply" | "apply-from-portal";

/** 03 §8.2 row 4: the welcome template this module owns. */
export type NannyWelcomeTemplate = Extract<TemplateId, "welcome-nanny">;
