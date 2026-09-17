// The test double behind the same port (05 §3 rule 2): a write is readable back, so a test cannot "succeed"
// against a store that records nothing. Production code inside the module it stubs (05 §3 rule 1).
import { ok } from "@/modules/platform";
import type { Email, UserId } from "@/modules/shared-types";
import type {
  ParentProfileInput,
  ParentProfileRow,
  ParentProfileStore,
} from "../types";

/** The memory double holds no email column; it derives the one the P-2 payload needs from the id it was given. */
const toRow = (input: ParentProfileInput): ParentProfileRow =>
  Object.freeze({
    ...input,
    email: `${input.userId}@example.invalid` as Email,
  });

export function memoryParentProfileStore(): ParentProfileStore & {
  readonly rows: () => ReadonlyArray<ParentProfileInput>;
} {
  const state: { rows: ReadonlyArray<ParentProfileInput> } = { rows: [] };
  return Object.freeze({
    create: async (input: ParentProfileInput) => {
      state.rows = [...state.rows, input];
      return ok(undefined);
    },
    get: async (userId: UserId) => {
      const row = state.rows.find((entry) => entry.userId === userId);
      return ok(row === undefined ? null : toRow(row));
    },
    rows: () => state.rows,
  });
}
