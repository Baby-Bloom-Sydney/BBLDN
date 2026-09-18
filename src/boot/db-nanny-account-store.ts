// The `NannyAccountStore` of `onboarding-nanny` over `auth`'s data port — `0021`'s three definers (ADR-152) at
// **session scope** for the profile and isolation writes, deliberately: each takes no user id and acts for `auth.uid()`, so running them under the
// service role would silently mean "no session", which they refuse. The reads are the nanny's own rows under
// RLS (`nannies_self_select`, `user_profiles_self_select`).
//
// **One service-scope read, named here and in the module README (07 §5.1 rule 5).** `get()` also answers the
// under-3 signal N1 captured and never shows her (04 §4.1 row 5), which S-N-01's active / passive variant reads
// (kickoff debt 14). It lives on `nanny_leads.lead_signals`, and `nanny_leads` is service-role only (02 §4.7) —
// so the lead is read at service scope, keyed on the `lead_id` the account already carries, and only when there
// is one. It answers nothing else off that row: this is a boolean about her own application, not a second road
// into the lead table. A refusal or a lead with no signal leaves the field **off**, and S-N-01 then reads the
// active wording — absent beats wrong, and every account created before the funnel captured the signal is in
// exactly that case.
import type { DataAccessPort } from "@/modules/auth";
import type {
  NannyAccountStore,
  NannyContactPatch,
  NannyProfile,
  NannyProfilePatch,
  NannyStoreErrorDetails,
} from "@/modules/onboarding-nanny";
import { ok } from "@/modules/platform";
import type {
  E164,
  Email,
  ISODate,
  NannyId,
  Result,
  UserId,
} from "@/modules/shared-types";

const session = { scope: "session" as const };
const service = { scope: "service" as const };

const asStore = <T>(result: Result<T>): Result<T, NannyStoreErrorDetails> =>
  result as Result<T, NannyStoreErrorDetails>;

/** The camel → snake map of ADR-152 (2)'s static column list, one place, so the definer and this file agree. */
const PROFILE_COLUMNS: Readonly<Record<keyof NannyProfilePatch, string>> =
  Object.freeze({
    bio: "bio",
    yearsExperience: "years_experience",
    qualification: "qualification",
    certificates: "certificates",
    languages: "languages",
    hasCar: "has_car",
    hasDrivingLicence: "has_driving_licence",
    isNonSmoker: "is_non_smoker",
    comfortableWithPets: "comfortable_with_pets",
    hourlyRateMinPence: "hourly_rate_min_pence",
    availability: "availability",
    availableFrom: "available_from",
  });

const CONTACT_COLUMNS: Readonly<Record<keyof NannyContactPatch, string>> =
  Object.freeze({
    mobile: "mobile",
    district: "district",
    area: "area",
    dateOfBirth: "date_of_birth",
  });

const toColumns = <K extends string>(
  map: Readonly<Record<K, string>>,
  patch: Partial<Record<K, unknown>> | undefined,
): Record<string, unknown> =>
  Object.fromEntries(
    (Object.keys(map) as unknown as ReadonlyArray<K>)
      .filter((key) => patch !== undefined && patch[key] !== undefined)
      .map((key) => [map[key], patch?.[key]]),
  );

type NannyRow = {
  readonly id: string;
  readonly user_id: string;
  readonly bio: string | null;
  readonly years_experience: number | null;
  readonly qualification: string | null;
  readonly certificates: ReadonlyArray<string> | null;
  readonly languages: ReadonlyArray<string> | null;
  readonly has_car: boolean | null;
  readonly has_driving_licence: boolean | null;
  readonly is_non_smoker: boolean | null;
  readonly comfortable_with_pets: boolean | null;
  readonly hourly_rate_min_pence: number | null;
  readonly availability: unknown;
  readonly available_from: string | null;
  readonly is_isolated: boolean;
  readonly verification_level: string;
  readonly profile_visible: boolean;
  readonly lead_id: string | null;
};

type ProfileRow = {
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly district: string | null;
  readonly area: string | null;
  readonly date_of_birth: string | null;
};

const opt = <T>(key: string, value: T | null | undefined) =>
  value === null || value === undefined ? {} : { [key]: value };

const profileOf = (nanny: NannyRow, profile: ProfileRow | null): NannyProfile =>
  Object.freeze({
    userId: nanny.user_id as UserId,
    nannyId: nanny.id as NannyId,
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    email: (profile?.email ?? "") as Email,
    ...opt("mobile", profile?.mobile as E164 | null | undefined),
    ...opt("district", profile?.district),
    ...opt("area", profile?.area),
    ...opt("dateOfBirth", profile?.date_of_birth as ISODate | null | undefined),
    ...opt("bio", nanny.bio),
    ...opt("yearsExperience", nanny.years_experience),
    ...opt("qualification", nanny.qualification),
    ...opt("certificates", nanny.certificates),
    ...opt("languages", nanny.languages),
    ...opt("hasCar", nanny.has_car),
    ...opt("hasDrivingLicence", nanny.has_driving_licence),
    ...opt("isNonSmoker", nanny.is_non_smoker),
    ...opt("comfortableWithPets", nanny.comfortable_with_pets),
    ...opt("hourlyRateMinPence", nanny.hourly_rate_min_pence),
    ...opt(
      "availability",
      nanny.availability as NannyProfile["availability"] | null,
    ),
    ...opt("availableFrom", nanny.available_from as ISODate | null),
    isIsolated: nanny.is_isolated,
    verificationLevel:
      nanny.verification_level as NannyProfile["verificationLevel"],
    profileVisible: nanny.profile_visible,
  });

/** Her own rows plus the `lead_id` the signal read is keyed on — internal, never part of `NannyProfile`. */
type OwnRows = {
  readonly profile: NannyProfile;
  readonly leadId: string | null;
};

/**
 * The under-3 signal off her own lead row (kickoff debt 14). `null` means "we do not know" — a lead that could
 * not be read, a row that is gone, or a `lead_signals` with nothing in it — and the caller leaves the field off.
 */
async function underThreeSignal(
  port: DataAccessPort,
  leadId: string,
): Promise<boolean | null> {
  const read = await port.run<boolean | null>(
    {
      name: "onboarding-nanny.readLeadSignal",
      exec: async (q) => {
        const row = (await q.from("nanny_leads").eq("id", leadId).single()) as {
          readonly lead_signals: unknown;
        } | null;
        const signals = row?.lead_signals;
        if (typeof signals !== "object" || signals === null) return null;
        const value = (signals as Record<string, unknown>).under_three;
        return typeof value === "boolean" ? value : null;
      },
    },
    service,
  );
  return read.ok ? read.value : null;
}

export function dbNannyAccountStore(
  port: DataAccessPort,
  currentUserId: () => Promise<Result<UserId | null>>,
): NannyAccountStore {
  return Object.freeze({
    create: async (input) =>
      asStore(
        await port.run<{
          readonly nannyId: NannyId;
          readonly leadConverted: boolean;
        }>(
          {
            name: "onboarding-nanny.createAccount",
            exec: async (q) => {
              const out = (await q.rpc("create_nanny_account", {
                p_user_id: input.userId as string,
                p_first_name: input.firstName,
                p_last_name: input.lastName,
                p_isolated: input.isolated,
                p_mobile: input.mobile ?? undefined,
                p_district: input.district ?? undefined,
                p_area: input.area ?? undefined,
                p_lead_id: input.leadId ?? undefined,
                p_profile: toColumns(PROFILE_COLUMNS, input.profile) as never,
              })) as {
                readonly nanny_id: string;
                readonly lead_converted: boolean;
              };
              return {
                nannyId: out.nanny_id as NannyId,
                leadConverted: out.lead_converted === true,
              };
            },
          },
          // ADR-163: service scope — the definer is service_role only and acts for `input.userId`; the signup action
          // is the one caller and decides `isolated` by road, so a nanny's own session can never say false
          service,
        ),
      ),
    liftIsolation: async () =>
      asStore(
        await port.run<boolean>(
          {
            name: "onboarding-nanny.liftIsolation",
            exec: async (q) =>
              (await q.rpc("lift_nanny_isolation", undefined as never)) ===
              true,
          },
          session,
        ),
      ),
    updateProfile: async ({ profile, contact }) =>
      asStore(
        await port.run<{ readonly complete: boolean }>(
          {
            name: "onboarding-nanny.updateProfile",
            exec: async (q) => ({
              complete:
                (await q.rpc("update_nanny_profile", {
                  p_profile: toColumns(PROFILE_COLUMNS, profile) as never,
                  p_contact: toColumns(CONTACT_COLUMNS, contact) as never,
                })) === true,
            }),
          },
          session,
        ),
      ),
    get: async () => {
      const user = await currentUserId();
      if (!user.ok) return user as Result<never, NannyStoreErrorDetails>;
      if (user.value === null) return ok(null);
      const userId = user.value;
      const read = asStore(
        await port.run<OwnRows | null>(
          {
            name: "onboarding-nanny.readProfile",
            exec: async (q) => {
              const nanny = (await q
                .from("nannies")
                .eq("user_id", userId as string)
                .single()) as NannyRow | null;
              if (nanny === null) return null;
              const profile = (await q
                .from("user_profiles")
                .eq("user_id", userId as string)
                .single()) as ProfileRow | null;
              return {
                profile: profileOf(nanny, profile),
                leadId: nanny.lead_id ?? null,
              };
            },
          },
          session,
        ),
      );
      if (!read.ok) return read;
      if (read.value === null) return ok(null);
      const { profile, leadId } = read.value;
      if (leadId === null) return ok(profile);
      const signal = await underThreeSignal(port, leadId);
      return ok(
        signal === null
          ? profile
          : Object.freeze({ ...profile, worksWithUnderThrees: signal }),
      );
    },
  });
}
