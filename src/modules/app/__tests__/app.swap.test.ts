// The `app` connector's acceptance: the fail-closed default, and the youngest-child read that bounds a family's
// access (ADR-083 / 084) answered over `stubApp`.
import { beforeEach, describe, expect, it } from "vitest";
import { childLinking, configureChildLinking, stubApp } from "@/modules/app";
import type { ChildLink } from "@/modules/app";
import type { ChildId, FamilyId, ISODate } from "@/modules/shared-types";

const FAMILY = "family-1" as FamilyId;

const child = (id: string, dateOfBirth: string): ChildLink => ({
  childId: id as ChildId,
  familyId: FAMILY,
  dateOfBirth: dateOfBirth as ISODate,
  linkedNannyIds: [],
});

describe("the fail-closed default", () => {
  it("refuses the reads until boot wires them — a confident 'no children' would mis-bound every grant", async () => {
    const result = await childLinking.youngestChildDateOfBirth(FAMILY);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.details?.reason).toBe(
      "child-linking-not-configured",
    );
  });
});

describe("the youngest-child read, over stubApp", () => {
  beforeEach(() => {
    configureChildLinking(
      stubApp({
        [FAMILY]: [child("c1", "2023-04-01"), child("c2", "2025-09-30")],
      }),
    );
  });

  it("returns the youngest child's date of birth, not the first linked", async () => {
    const result = await childLinking.youngestChildDateOfBirth(FAMILY);

    expect(result.ok && result.value).toBe("2025-09-30");
  });

  it("returns null when no child is linked — the grant is unbounded until one is", async () => {
    const result = await childLinking.youngestChildDateOfBirth(
      "family-x" as FamilyId,
    );

    expect(result.ok && result.value).toBeNull();
  });

  it("lists every linked child", async () => {
    const result = await childLinking.linkedChildren(FAMILY);

    expect(result.ok && result.value.map((c) => c.childId)).toEqual([
      "c1",
      "c2",
    ]);
  });
});
