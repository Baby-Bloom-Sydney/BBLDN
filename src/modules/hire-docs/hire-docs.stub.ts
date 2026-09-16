// The `hire-docs` stub — a renderer that returns a named, empty document so `placements` and the hire-confirmation
// emails can be built and tested before `04.20` settles the wording. It deliberately produces **no prose**: an
// invented clause in a document a family relies on is the one failure this module must not have.
import { err, ok } from "@/modules/platform";
import type { HireDocs } from "./types";

export function stubHireDocs(): HireDocs {
  return Object.freeze({
    renderHireSummary: async (input) => {
      if (input.weeklyHours <= 0 || input.hourlyRatePence <= 0) {
        return err("VALIDATION", "Hours and rate must be positive", {
          reason: "E_PAYLOAD_INVALID" as const,
          which: input.weeklyHours <= 0 ? "weeklyHours" : "hourlyRatePence",
        });
      }
      return ok({
        kind: "pdf" as const,
        filename: `hire-summary-${input.placementId}-${input.audience}.pdf`,
        bytes: new Uint8Array(),
      });
    },
  });
}
