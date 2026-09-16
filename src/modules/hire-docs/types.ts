// hire-docs — the module's type surface (01 §2.5). The hire summary PDFs with UK-law wording (`04.20`), rendered
// with React-PDF. A true leaf: 01 §2.3 gives it **no** imports beyond `config` · `shared-types` · the service
// modules, so the wording reaches it as data, never by reading a table.
import type { ISODate, PlacementId, Result } from "@/modules/shared-types";

/**
 * What `placements` hands over at K-20 / L-1 (03 §10.1 `renderHireSummary`).
 *
 * GAP — recorded in the L-005 F-a PROGRESS entry. `04.20` owns the UK-law wording and 03 §10.1 names the method,
 * but no section states this input's fields or the document's shape. These are the placement facts 03 §2.4 K-20
 * already carries (hours, rate, start date) plus the two party names a hire summary cannot omit; everything else
 * — the clause set, the employment-status wording, whether the nanny copy differs from the family copy — waits
 * for `04.20`.
 */
export type HireSummaryInput = {
  readonly placementId: PlacementId;
  readonly audience: "family" | "nanny";
  readonly familyName: string;
  readonly nannyName: string;
  readonly weeklyHours: number;
  readonly hourlyRatePence: number;
  readonly startDate: ISODate;
};

export type HireDocument = {
  readonly kind: "pdf";
  readonly filename: string;
  readonly bytes: Uint8Array;
};

export type HireDocsErrorDetails = {
  readonly reason: "E_PAYLOAD_INVALID" | "hire-docs-not-configured";
  readonly which?: string;
};

export type HireDocsResult<T> = Result<T, HireDocsErrorDetails>;

/** 03 §10.1 — the one method `placements` calls. */
export type HireDocs = {
  readonly renderHireSummary: (
    input: HireSummaryInput,
  ) => Promise<HireDocsResult<HireDocument>>;
};
