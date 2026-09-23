// Which seeded document each `/legal/*` page renders (L-009 `3b`).
//
// Until now the eight pages under `src/app/(public)/legal/` carried Sydney's bodies as JSX — ~7,600 lines of
// NSW-governed policy, an ABN, `babybloomsydney.com.au` and the Privacy Act 1988, written for a different
// company in a different jurisdiction. `0026` seeded the eleven England-and-Wales rows (`3c`), every one marked
// **DRAFT — not legal advice, pending review**, and nothing pointed at them. This table is the pointer.
//
// **Why a table rather than a slug per page.** Two of the seven route names differ from their document ids
// (`/legal/client-terms` → `client-tos`, `/legal/cookies` → `cookie-policy`), so a page that derived the id from
// its own path would silently read nothing for those two and fall through to "unavailable" — the failure that
// looks like a missing seed. Naming both halves once, in one record, makes a wrong document id a compile error
// and gives the page tests something to iterate. An unmapped segment answers `undefined` and the page refuses
// (fail closed); it does not guess.
//
// **Keyed by route segment, and it imports nothing from `config`.** L4 governs brand, jurisdiction and prices,
// not routes — `public-routes.ts` says so in its own header ("paths are routes, not config"). Keeping `config`
// out has a second, sharper reason: `supabase/__tests__` runs with no environment at all, so a table that
// reached `publicEnv` through `URLS` could not be read by the integration test that proves each of these ids
// is actually seeded. The unit suite asserts each key is a real route directory with a register row, which is
// the check a `URLS` import would have bought.
//
// **The four seeded ids that are not here are not missing.** `parent-app-consent`, `nanny-attestation`,
// `media-consent` and `agr14_nanny_child_add` are clickwrap documents shown in `PolicyModal` at the moment of
// consent; they have no standalone public page and never had one.
//
// **`/legal/biometric-notice-client` is deleted by this unit, not mapped.** ADR-071 makes biometric verification
// nanny-only, so `0026` seeds one biometric notice — the professional's — and no client equivalent;
// `purpose-for-agreement.ts` already records the same fact for `AGR-03` ("client biometric notice — does not
// exist"). Pointing the client page at the professional's notice would publish a document written for somebody
// else, which is the one thing this phase must not do, and leaving Sydney's body there is what the unit exists
// to end. There is no third option, so the page goes.
import type { LegalDocumentId } from "@/modules/platform";

export const LEGAL_PAGE_DOCUMENTS: Readonly<
  Record<string, LegalDocumentId | undefined>
> = Object.freeze({
  "client-terms": "client-tos",
  "professional-terms": "professional-tos",
  "privacy-policy": "privacy-policy",
  "biometric-notice": "biometric-notice",
  "code-of-conduct": "code-of-conduct",
  cookies: "cookie-policy",
  disclaimer: "disclaimer",
});
