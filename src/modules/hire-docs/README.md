# hire-docs

**What it does.** The hire summary PDFs and their UK-law wording (`04.20`), rendered with React-PDF, sent by
`comms` as `hire-confirmation-family` / `hire-confirmation-nanny` at K-20 / L-1 (03 §2.4).

**Connector** (`index.ts` + `types.ts`, written and reviewed before the inside — L2):

| Area         | Values                                            | Types                                            |
| ------------ | ------------------------------------------------- | ------------------------------------------------ |
| The renderer | `hireDocs` (module binding) · `configureHireDocs` | `HireDocs` · `HireSummaryInput` · `HireDocument` |
| The stub     | `stubHireDocs` (`hire-docs.stub.ts`)              | `HireDocsErrorDetails` · `HireDocsResult`        |

One method: `renderHireSummary` (03 §10.1).

**What it may import.** Nothing but `config` · `shared-types` and the service modules (01 §2.3 lists no row for
it beyond the leaf defaults). Every fact it prints arrives as an argument — it reads no table, which is what keeps
a legal document reproducible from its inputs alone.

**What this module does _not_ do yet (F-a boundaries), and why the stub is deliberately empty.** `04.20` owns the
UK-law wording and has not landed. `stubHireDocs` therefore returns a correctly **named** but byte-empty PDF, and
the swap test asserts that emptiness on purpose: a placeholder clause inside a document a family relies on would
be a worse failure than a missing document. The input's fields are the placement facts 03 §2.4 K-20 already
carries plus the two party names; the clause set, the employment-status wording and whether the nanny copy differs
from the family copy all wait for `04.20`. Recorded in the L-005 F-a PROGRESS entry.

**Suites.** `src/modules/hire-docs/__tests__/hire-docs.swap.test.ts` — the renderer swapped, the per-audience
filename, the empty-prose assertion, the fail-closed seam and the `VALIDATION` refusal of a non-positive rate.

<!-- audit
Last edited: 2026-09-16T14:35+10:00 — BB-LDN-Planner-070926/F-a
Notes: initial authoring — the F-a connector, `stubHireDocs` and the swap test. Recorded gap: `04.20` owes the
wording and the document shape, so the stub prints nothing.
-->
