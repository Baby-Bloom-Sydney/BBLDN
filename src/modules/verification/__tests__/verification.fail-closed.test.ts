// The unconfigured `verification` binding, exercised as it actually ships (REVIEW-1, the ADR-117 Tier B sweep).
//
// The inside exists since L-008 `2b` (ADR-154) and boot installs it (`src/boot/wire-verification.ts`); the
// registry's DEFAULT still refuses every road, which is what this file proves — an importer that runs before
// boot, or a test that never configures the module, gets a refusal and never a level from nowhere. It never
// calls `configureVerification`, so every call below runs against the real `VERIFICATION_REGISTRY` default.
import { describe, expect, it } from "vitest";
import { verification } from "@/modules/verification";
import type { UserId } from "@/modules/shared-types";

const NANNY = "nanny-1" as UserId;

describe("verification before any configureVerification call — the real registry default", () => {
  it("refuses getStatus rather than reporting a verification level from nowhere", async () => {
    const result = await verification.getStatus(NANNY);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("INTERNAL");
    expect(result.ok === false && result.error.details?.reason).toBe(
      "verification-not-configured",
    );
  });

  it("refuses submitSection rather than accepting evidence nothing will store", async () => {
    const result = await verification.submitSection({
      id: "evidence-1",
      nannyId: NANNY,
      type: "identity-document",
      documents: [],
      declared: {},
    } as never);

    expect(result.ok === false && result.error.details?.reason).toBe(
      "verification-not-configured",
    );
  });

  it("refuses applyCheckResult and override — the two paths that would move a level", async () => {
    const applied = await verification.applyCheckResult({} as never);
    const overridden = await verification.override(NANNY, {} as never);

    expect(applied.ok === false && applied.error.details?.reason).toBe(
      "verification-not-configured",
    );
    expect(overridden.ok === false && overridden.error.details?.reason).toBe(
      "verification-not-configured",
    );
  });
});
