// The test double behind the same port (05 §3 rule 2): a write is readable back, so a test cannot "succeed"
// against a store that records nothing. Production code inside the module it stubs (05 §3 rule 1).
import { ok } from "@/modules/platform";
import type { ParentProfileInput, ParentProfileStore } from "../types";

export function memoryParentProfileStore(): ParentProfileStore & {
  readonly rows: () => ReadonlyArray<ParentProfileInput>;
} {
  const state: { rows: ReadonlyArray<ParentProfileInput> } = { rows: [] };
  return Object.freeze({
    create: async (input: ParentProfileInput) => {
      state.rows = [...state.rows, input];
      return ok(undefined);
    },
    rows: () => state.rows,
  });
}
