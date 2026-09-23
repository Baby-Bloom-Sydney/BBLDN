// The words that say a seeded legal document is not law yet (L-009 kickoff §3; `0026`).
//
// One definition, three readers: `0026` writes it into every v1 body, `LegalDocument` looks for it to raise the
// banner a visitor sees, and the page tests assert the banner is up. `supabase/__tests__/consent-erasure-binding`
// asserts the same string against the seeded rows.
//
// The em dash and the trailing "pending review" are load-bearing — this is matched by `includes`, not by a
// fuzzy test, so a body that says something *similar* raises no banner and fails the page test rather than
// publishing unreviewed text that looks reviewed. When `3a`'s solicitor text lands as version 2 it will not
// carry this string, the banner will not render, and nothing else changes.
export const DRAFT_MARKING = "DRAFT — not legal advice, pending review";
