// The test double behind the lead port (05 §3 rule 2): a capture is readable back, a patch changes what the
// next read answers, and the two rules 02 §4.7 states are honoured — an unconverted lead under the same address
// is overwritten in place, and an address that already has an account answers `has-account` and writes nothing.
// `accounts` seeds the addresses that "already have an account" (the db adapter reads `user_profiles.email`).
import { newId, ok } from "@/modules/platform";
import type { LeadId } from "@/modules/shared-types";
import type {
  NannyApplicationInput,
  NannyLead,
  NannyLeadPatch,
  NannyLeadSource,
  NannyLeadStore,
} from "../types";

const fresh = (
  id: LeadId,
  input: NannyApplicationInput & { readonly source: NannyLeadSource },
): NannyLead =>
  Object.freeze({
    id,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    mobile: input.mobile,
    district: input.district,
    area: input.area,
    rtwStatus: input.rtwStatus,
    hasEnhancedDbs: input.hasEnhancedDbs,
    yearsExperience: input.yearsExperience,
    ageGroups: input.ageGroups,
    roleTypes: [],
    availability: null,
    rateBand: null,
    bio: null,
    status: "applied",
    source: input.source,
  });

export function memoryNannyLeadStore(
  seed: { readonly accounts?: ReadonlyArray<string> } = {},
): NannyLeadStore & {
  readonly rows: () => ReadonlyArray<NannyLead>;
  /** the signup road's half of the double: marks the lead converted, as `create_nanny_account()` does */
  readonly markConverted: (leadId: LeadId) => void;
} {
  const state: {
    rows: ReadonlyArray<NannyLead>;
    accounts: ReadonlyArray<string>;
  } = { rows: [], accounts: seed.accounts ?? [] };
  const replace = (next: NannyLead): void => {
    state.rows = state.rows.some((row) => row.id === next.id)
      ? state.rows.map((row) => (row.id === next.id ? next : row))
      : [...state.rows, next];
  };
  return Object.freeze({
    capture: async (input) => {
      if (state.accounts.includes(input.email)) {
        return ok({ leadId: newId<LeadId>(), state: "has-account" as const });
      }
      const existing = state.rows.find((row) => row.email === input.email);
      if (existing !== undefined && existing.status === "converted")
        return ok({ leadId: existing.id, state: "has-account" as const });
      const id = existing?.id ?? newId<LeadId>();
      replace(fresh(id, input));
      return ok({
        leadId: id,
        state: existing === undefined ? ("created" as const) : ("updated" as const),
      });
    },
    get: async (leadId) =>
      ok(state.rows.find((row) => row.id === leadId) ?? null),
    patch: async (leadId, patch: NannyLeadPatch) => {
      const row = state.rows.find((entry) => entry.id === leadId);
      if (row === undefined) return ok(undefined);
      const { funnelStep: _step, ...fields } = patch;
      replace(Object.freeze({ ...row, ...fields }));
      return ok(undefined);
    },
    rows: () => state.rows,
    markConverted: (leadId) => {
      const row = state.rows.find((entry) => entry.id === leadId);
      if (row !== undefined) replace(Object.freeze({ ...row, status: "converted" }));
    },
  });
}
