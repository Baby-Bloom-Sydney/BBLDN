// 03 §9.3 — the browser-emittable subset (`track` → POST /api/events); everything else is server-only.
export const CLIENT_EVENT_NAMES = Object.freeze([
  "visit",
  "quick-match.run",
  "wizard.step",
  "results.viewed",
  "profile.viewed",
  "ui.click",
  "consent.updated",
] as const);
