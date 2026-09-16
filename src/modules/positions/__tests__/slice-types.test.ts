// ADR-119 — the slice types live in `shared-types/stage-model.ts`, where 03 §2.5 places them, and the three slice
// modules use **those** types. F-a had worked around their absence with local structural copies
// (`StageTransitionHandler` in `connections` / `placements`, `TransitionHandler` + `SliceRegistration` in
// `positions`); a structural lookalike type-checks identically, so the type-level half alone cannot tell the two
// apart. Hence two halves: `expectTypeOf` pins the shapes to the shared declarations, and a source read pins that
// the shared file declares them and the three modules declare no copy. This test lives in `positions` because
// 01 §2.3 gives `positions` the arrows to `connections` and `placements`; the reverse direction is the cycle R2 closed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ConnectionsSlice } from "@/modules/connections";
import type { PlacementsSlice } from "@/modules/placements";
import type {
  RegisterSlice as PositionsRegisterSlice,
  SliceRegistration as PositionsSliceRegistration,
  TransitionHandler as PositionsTransitionHandler,
} from "@/modules/positions";
import { registerSlice } from "@/modules/positions";
import type {
  RegisterSlice,
  SliceRegistration,
  TransitionHandler,
} from "@/modules/shared-types";

const MODULES_ROOT = resolve(__dirname, "../..");
const sourceOf = (relative: string): string =>
  readFileSync(resolve(MODULES_ROOT, relative), "utf8");

const SLICE_MODULE_TYPE_FILES = [
  "positions/types.ts",
  "connections/types.ts",
  "placements/types.ts",
] as const;

describe("ADR-119 — the slice types are shared-types' (03 §2.5)", () => {
  it("shared-types/stage-model.ts declares TransitionHandler, SliceRegistration and RegisterSlice", () => {
    const text = sourceOf("shared-types/stage-model.ts");

    expect(text).toMatch(/^export type TransitionHandler = \{/m);
    expect(text).toMatch(/^export type SliceRegistration = \{/m);
    expect(text).toMatch(/^export type RegisterSlice = /m);
  });

  it("positions, connections and placements declare no local copy of the handler shape", () => {
    for (const relative of SLICE_MODULE_TYPE_FILES) {
      const text = sourceOf(relative);

      expect(text, relative).not.toMatch(/StageTransitionHandler/);
      expect(text, relative).not.toMatch(/^export type TransitionHandler\b/m);
      expect(text, relative).not.toMatch(/^export type SliceRegistration\b/m);
      // the handler's shape restated locally — `run: (input, uow) => …` — is what a lookalike looks like
      expect(text, relative).not.toMatch(/readonly run: \(/);
    }
  });

  it("the three modules' slice types equal the shared types (type-level; `tsc` is the judge)", () => {
    expectTypeOf<ConnectionsSlice>().toEqualTypeOf<
      ReadonlyArray<TransitionHandler>
    >();
    expectTypeOf<PlacementsSlice>().toEqualTypeOf<
      ReadonlyArray<TransitionHandler>
    >();
    expectTypeOf<PositionsTransitionHandler>().toEqualTypeOf<TransitionHandler>();
    expectTypeOf<PositionsSliceRegistration>().toEqualTypeOf<SliceRegistration>();
    expectTypeOf<PositionsRegisterSlice>().toEqualTypeOf<RegisterSlice>();
    // `positions` implements the 03 §2.5 signature; `shared-types` carries no behaviour, so only the type moved.
    expectTypeOf(registerSlice).toEqualTypeOf<RegisterSlice>();
  });
});
