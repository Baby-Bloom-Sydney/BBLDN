// The `NannyLeadStore` of `onboarding-nanny` over `auth`'s data port — `nanny_leads` (02 §4.7 row 1) at
// **service scope**, named in 07 §5.1 rule 5 (ADR-152): the table is service-role only and the funnel's caller
// has no session. One statement per step — an insert or an update — so nothing here needs a unit of work.
//
// 02 §4.7's two rules live here: an unconverted lead under the same address is overwritten in place, and an
// address that already has an account answers `has-account` — read from `user_profiles.email` (the mirror of
// the auth email, C-8) and from a converted lead, never by asking the identity provider (07 §4: no enumeration
// oracle; the funnel's answer is the same "sign in instead" line either way).
import type { DataAccessPort } from "@/modules/auth";
import type {
  NannyAgeGroup,
  NannyApplicationInput,
  NannyAvailability,
  NannyLead,
  NannyLeadPatch,
  NannyLeadSource,
  NannyLeadStore,
  NannyRateBand,
  NannyRoleType,
  NannyStoreErrorDetails,
} from "@/modules/onboarding-nanny";
import type { E164, Email, LeadId, Result, Uuid } from "@/modules/shared-types";

const service = { scope: "service" as const };

const asStore = <T>(result: Result<T>): Result<T, NannyStoreErrorDetails> =>
  result as Result<T, NannyStoreErrorDetails>;

/** 02 §4.7: the jsonb sections this module writes and reads back. */
type LeadRow = {
  readonly id: string;
  readonly email: string;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly phone: string | null;
  readonly district: string | null;
  readonly area: string | null;
  readonly right_to_work_status: string;
  readonly qualifications: unknown;
  readonly experience: unknown;
  readonly preferences: unknown;
  readonly availability: unknown;
  readonly salary: unknown;
  readonly about_you: unknown;
  readonly lead_status: string;
  readonly source: string | null;
  readonly converted_at: string | null;
};

const asObject = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const leadFromRow = (row: LeadRow): NannyLead => {
  const qualifications = asObject(row.qualifications);
  const experience = asObject(row.experience);
  const preferences = asObject(row.preferences);
  const salary = asObject(row.salary);
  const about = asObject(row.about_you);
  const availability = asObject(row.availability);
  return Object.freeze({
    id: row.id as LeadId,
    email: row.email as Email,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    mobile: (row.phone as E164 | null) ?? null,
    district: row.district,
    area: row.area,
    rtwStatus: row.right_to_work_status as NannyLead["rtwStatus"],
    hasEnhancedDbs: typeof qualifications.has_enhanced_dbs === "boolean" ? qualifications.has_enhanced_dbs : null,
    yearsExperience: typeof experience.years === "number" ? experience.years : null,
    ageGroups: Array.isArray(experience.age_groups) ? (experience.age_groups as ReadonlyArray<NannyAgeGroup>) : [],
    roleTypes: Array.isArray(preferences.role_types) ? (preferences.role_types as ReadonlyArray<NannyRoleType>) : [],
    availability: Object.keys(availability).length === 0 ? null : (availability as NannyAvailability),
    rateBand:
      typeof salary.min_pence === "number" && typeof salary.max_pence === "number"
        ? ({ minPence: salary.min_pence, maxPence: salary.max_pence } as NannyRateBand)
        : null,
    bio: typeof about.bio === "string" ? about.bio : null,
    status: row.lead_status as NannyLead["status"],
    source: row.source,
  });
};

const columnsFor = (input: NannyApplicationInput & { readonly source: NannyLeadSource }) => ({
  first_name: input.firstName,
  last_name: input.lastName,
  email: input.email,
  phone: input.mobile,
  district: input.district,
  area: input.area,
  lives_in_service_area: true,
  right_to_work_status: input.rtwStatus,
  qualifications: { has_enhanced_dbs: input.hasEnhancedDbs },
  experience: { years: input.yearsExperience, age_groups: [...input.ageGroups] },
  lead_signals: { under_three: input.ageGroups.some((g) => g === "babies" || g === "toddlers") },
  source: input.source,
  funnel_step: "S-X-15",
  last_active_at: new Date().toISOString(),
});

const patchColumns = (patch: NannyLeadPatch) => ({
  ...(patch.roleTypes === undefined ? {} : { preferences: { role_types: [...patch.roleTypes] } }),
  ...(patch.availability === undefined ? {} : { availability: patch.availability }),
  ...(patch.rateBand === undefined ? {} : { salary: { min_pence: patch.rateBand.minPence, max_pence: patch.rateBand.maxPence, currency: "GBP" } }),
  ...(patch.bio === undefined ? {} : { about_you: { bio: patch.bio } }),
  ...(patch.funnelStep === undefined ? {} : { funnel_step: patch.funnelStep }),
  last_active_at: new Date().toISOString(),
});

export function dbNannyLeadStore(port: DataAccessPort): NannyLeadStore {
  return Object.freeze({
    capture: async (input) =>
      asStore(
        await port.run(
          {
            name: "onboarding-nanny.captureLead",
            exec: async (q) => {
              const profiles = await q.from("user_profiles").eq("email", input.email).select(["user_id"]);
              if (profiles.length > 0)
                return { leadId: "" as LeadId, state: "has-account" as const };
              const existing = (await q.from("nanny_leads").eq("email", input.email).single()) as LeadRow | null;
              if (existing !== null && existing.converted_at !== null)
                return { leadId: existing.id as LeadId, state: "has-account" as const };
              if (existing !== null) {
                await q.from("nanny_leads").update(existing.id as Uuid, columnsFor(input) as never);
                return { leadId: existing.id as LeadId, state: "updated" as const };
              }
              const inserted = (await q.from("nanny_leads").insert(columnsFor(input) as never)) as LeadRow;
              return { leadId: inserted.id as LeadId, state: "created" as const };
            },
          },
          service,
        ),
      ),
    get: async (leadId) =>
      asStore(
        await port.run(
          {
            name: "onboarding-nanny.readLead",
            exec: async (q) => {
              const row = (await q.from("nanny_leads").eq("id", leadId as string).single()) as LeadRow | null;
              return row === null ? null : leadFromRow(row);
            },
          },
          service,
        ),
      ),
    patch: async (leadId, patch) =>
      asStore(
        await port.run(
          {
            name: "onboarding-nanny.patchLead",
            exec: async (q) => {
              await q.from("nanny_leads").update(leadId as string as Uuid, patchColumns(patch) as never);
            },
          },
          service,
        ),
      ),
  });
}
