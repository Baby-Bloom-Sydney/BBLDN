// S-N-17 `/nanny/profile` — her own profile, as she sees it (`03.22` Rejig; 04 §6.3 "complete · incomplete →
// S-N-18"). Pure: a route reads her two rows and her verification state and hands them here.
//
// **It is a view, not a second editor.** 04 §6.3 gives S-N-17 exactly two states and one exit — incomplete goes
// to S-N-18 — so every "edit" here is a link into the stepper at the step that owns the field, and
// `update_nanny_profile()` keeps its one caller (ADR-152 (2)). A second write road would be a second place for
// the completeness rule to drift from the database's.
//
// **Her own completeness, her own next step** (the planner's ruling). The gate is `03.18`'s, mirrored in
// `isNannyProfileComplete`, and what is missing is named by the step that asks for it — so the words she reads
// are the words she will see when she gets there.
//
// **It never names the hold.** Everything it says about verification comes from `nannyVerificationSummary`,
// whose whole input is the level and the four section statuses; see that file's header.
import { LOCALE } from "@/modules/config";
import type { VerificationState } from "@/modules/verification";
import type {
  NannyProfile,
  NannyProfileFact,
  NannyProfileGap,
  NannyProfileView,
} from "../types";
import { isNannyProfileComplete } from "./is-nanny-profile-complete";
import { PROFILE_STEPS } from "./profile-steps";
import { nannyVerificationSummary } from "./nanny-verification-summary";

const PENCE_IN_POUND = 100;

const money = (pence: number): string =>
  new Intl.NumberFormat(LOCALE.locale, {
    style: "currency",
    currency: LOCALE.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(pence / PENCE_IN_POUND);

const list = (values: ReadonlyArray<string> | undefined): string | null =>
  values === undefined || values.length === 0 ? null : values.join(" · ");

const yes = (value: boolean | undefined, label: string): string | null =>
  value === true ? label : null;

const stepIndexOf = (id: (typeof PROFILE_STEPS)[number]["id"]): number =>
  PROFILE_STEPS.findIndex((step) => step.id === id);

const gapOf = (id: (typeof PROFILE_STEPS)[number]["id"]): NannyProfileGap => {
  const index = stepIndexOf(id);
  return Object.freeze({
    stepIndex: index,
    label: PROFILE_STEPS[index].heading,
  });
};

/** `03.18`'s gate, said back to her one field at a time, in the stepper's order. */
function gapsOf(profile: NannyProfile): ReadonlyArray<NannyProfileGap> {
  const open: Array<NannyProfileGap> = [];
  if (profile.district === undefined || profile.mobile === undefined)
    open.push(gapOf("location"));
  if (profile.yearsExperience === undefined) open.push(gapOf("experience"));
  if (profile.qualification === undefined || profile.qualification === "")
    open.push(gapOf("qualification"));
  if (profile.availability === undefined) open.push(gapOf("availability"));
  if (profile.hourlyRateMinPence === undefined) open.push(gapOf("rate"));
  if ((profile.bio ?? "") === "") open.push(gapOf("about-you"));
  return Object.freeze(open);
}

/** What a family reads about her, with the step that owns each line so "edit" lands in the right place. */
function factsOf(profile: NannyProfile): ReadonlyArray<NannyProfileFact> {
  const practical =
    list(
      [
        yes(profile.hasDrivingLicence, "Driving licence"),
        yes(profile.hasCar, "Has a car"),
        yes(profile.isNonSmoker, "Non-smoker"),
        yes(profile.comfortableWithPets, "Comfortable with pets"),
      ].filter((each): each is string => each !== null),
    ) ?? null;
  const rows: ReadonlyArray<[NannyProfileFact["id"], string, string | null]> = [
    [
      "about-you",
      "About you",
      (profile.bio ?? "") === "" ? null : (profile.bio ?? null),
    ],
    [
      "experience",
      "Years with children",
      profile.yearsExperience === undefined
        ? null
        : String(profile.yearsExperience),
    ],
    ["qualification", "Qualification", profile.qualification ?? null],
    ["certificates", "Certificates", list(profile.certificates)],
    ["languages", "Languages", list(profile.languages)],
    ["practical", "The practical things", practical],
  ];
  return Object.freeze(
    rows.map(([id, label, value]) =>
      Object.freeze({ id, label, value, stepIndex: stepIndexOf(id) }),
    ),
  );
}

export function nannyProfileView(
  profile: NannyProfile,
  state: VerificationState,
): NannyProfileView {
  const missing = gapsOf(profile);
  return Object.freeze({
    firstName: profile.firstName,
    areaLine:
      profile.area === undefined || profile.district === undefined
        ? null
        : `${profile.area} · ${profile.district}`,
    complete: isNannyProfileComplete(profile),
    nextStep: missing[0] ?? null,
    missing,
    facts: factsOf(profile),
    rateLine:
      profile.hourlyRateMinPence === undefined
        ? null
        : `From ${money(profile.hourlyRateMinPence)} an hour`,
    availability: profile.availability ?? null,
    verification: nannyVerificationSummary(state),
  });
}
