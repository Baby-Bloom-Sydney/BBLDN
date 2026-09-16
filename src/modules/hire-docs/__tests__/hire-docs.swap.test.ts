// The `hire-docs` swap test (03 §11's L3 law applied to the one method 03 §10.1 names): keep `index.ts` +
// `types.ts`, point the connector at a renderer that is not React-PDF, and `placements` does not move.
//
// The assertion that matters most here is the negative one: the stub produces **no prose**. `04.20` owns the
// UK-law wording, and a placeholder clause inside a document a family relies on would be a worse failure than a
// missing document.
import { beforeEach, describe, expect, it } from "vitest";
import { configureHireDocs, hireDocs, stubHireDocs } from "@/modules/hire-docs";
import { err } from "@/modules/platform";
import type { HireSummaryInput } from "@/modules/hire-docs";
import type { ISODate, PlacementId } from "@/modules/shared-types";

const INPUT: HireSummaryInput = Object.freeze({
  placementId: "placement-1" as PlacementId,
  audience: "family",
  familyName: "The Example family",
  nannyName: "An Example nanny",
  weeklyHours: 40,
  hourlyRatePence: 1500, // config-literal-ok: a placement fixture, not a price — PRICES owns real money (03 §5.2)
  startDate: "2026-02-01" as ISODate,
});

beforeEach(() => {
  configureHireDocs(stubHireDocs());
});

describe("hire-docs through the connector binding", () => {
  it("fails closed before boot configures a renderer", async () => {
    configureHireDocs({
      renderHireSummary: async () =>
        err("INTERNAL", "Hire docs is not configured", {
          reason: "hire-docs-not-configured" as const,
        }),
    });

    const result = await hireDocs.renderHireSummary(INPUT);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "hire-docs-not-configured",
    );
  });

  it("names the document by placement and audience", async () => {
    const result = await hireDocs.renderHireSummary(INPUT);

    expect(result.ok && result.value.filename).toBe(
      "hire-summary-placement-1-family.pdf",
    );
    expect(result.ok && result.value.kind).toBe("pdf");
  });

  it("renders a different file for the nanny copy", async () => {
    const family = await hireDocs.renderHireSummary(INPUT);
    const nanny = await hireDocs.renderHireSummary({
      ...INPUT,
      audience: "nanny",
    });

    expect(family.ok).toBe(true);
    expect(nanny.ok).toBe(true);
    if (!family.ok || !nanny.ok) return;
    expect(family.value.filename).not.toBe(nanny.value.filename);
  });

  it("writes no wording at all — `04.20` owns the clauses, not the stub", async () => {
    const result = await hireDocs.renderHireSummary(INPUT);

    expect(result.ok && result.value.bytes.byteLength).toBe(0);
  });

  it("rejects a non-positive rate as VALIDATION rather than printing it", async () => {
    const result = await hireDocs.renderHireSummary({
      ...INPUT,
      hourlyRatePence: 0, // config-literal-ok: the invalid-input case, not a price
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(!result.ok && result.error.details?.which).toBe("hourlyRatePence");
  });
});
