// The unconfigured `connections` binding, exercised as it actually ships (REVIEW-1, the ADR-117 Tier B sweep).
//
// `connections.swap.test.ts` configures the stub in `beforeEach` and so never reaches the real registry
// default. This file never calls `configureConnections`; vitest isolates module state per file, so every call
// below runs against `CONNECTIONS_REGISTRY`'s factory default.
//
// Why it matters here specifically: both reads feed a *narrowing* decision. `liveNannyIdsForParent` fills
// `activeConnectionWithFamily` for matching exclusion (03 §7.5) and `liveCountForPosition` feeds the P-3 / P-4
// cascades. An unconfigured binding that answered "none" would silently widen a candidate set that should have
// been narrowed — which is exactly the failure the registry's comment says it exists to prevent.
import { describe, expect, it } from "vitest";
import { connections } from "@/modules/connections";
import type { ParentId, PositionId } from "@/modules/shared-types";

describe("connections before any configureConnections call — the real registry default", () => {
  it("refuses liveNannyIdsForParent rather than answering 'no live nannies' from nowhere", async () => {
    const result = await connections.liveNannyIdsForParent(
      "parent-1" as ParentId,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("INTERNAL");
    expect(!result.ok && result.error.details?.reason).toBe(
      "connections-not-configured",
    );
  });

  it("refuses liveCountForPosition rather than answering zero", async () => {
    const result = await connections.liveCountForPosition(
      "position-1" as PositionId,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "connections-not-configured",
    );
  });
});
