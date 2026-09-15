// The one ErrorCode registry (01 §4a; 03 §1 rule 4). HTTP mapping is `platform`'s envelope helper (01 §2.4).
export const ERROR_CODES = Object.freeze([
  "UNAUTHENTICATED", // 401 — no session
  "FORBIDDEN", // 403 — wrong role / not the owner
  "NOT_FOUND", // 404 — absent or hidden from this user
  "VALIDATION", // 422 — zod parse failed at the boundary
  "CONFLICT", // 409 — state-model rule
  "RATE_LIMITED", // 429
  "PROVIDER_ERROR", // 502 — details.provider names it
  "INTERNAL", // 500 — logged with request id, generic message
] as const);
