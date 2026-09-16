// 02 §7 — the nine views the schema keeps, as a frozen tuple (ADR-129: the data port reads views as well as
// tables). A view is **read-only through the port**: `Query.from()` hands back a select-only handle for any name
// in this list, and the type forbids `insert` / `update` on it. Pinned equal to the generated
// `Database["public"]["Views"]` keys by `auth/__tests__/auth.views.test.ts`, so a view added by migration
// without a row here fails a test rather than silently gaining a write surface.
export const VIEW_NAMES = Object.freeze([
  "booking_events",
  "child_client_events",
  "connection_events",
  "connection_party_contact",
  "family_access",
  "nanny_public",
  "page_visits",
  "verification_events",
  "verification_status",
] as const);
