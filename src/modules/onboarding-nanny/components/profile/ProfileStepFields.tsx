"use client";
// S-N-18's field sets, one per step id (`03.17`): the fields `PROFILE_STEPS[i].fields` names, prefilled from the
// profile (04 §6.3 "fields already held are prefilled", a11y-18). The area picker and the grid are the funnel's.
import { FUNNEL_OPTIONS } from "../../lib/funnel-options";
import type {
  NannyFunnelOptions,
  NannyProfile,
  ProfileStepId,
} from "../../types";
import { AvailabilityGrid } from "../funnel/AvailabilityGrid";
import { DistrictCombobox } from "../funnel/DistrictCombobox";
import { FIELD_STYLES } from "../funnel/field-styles";

const yesNo = (name: string, legend: string, current: boolean | undefined) => (
  <fieldset key={name} className="space-y-1">
    <legend className={FIELD_STYLES.label}>{legend}</legend>
    <div className="flex gap-4">
      {(["yes", "no"] as const).map((answer) => (
        <label
          key={answer}
          className="flex items-center gap-2 text-sm text-slate-800"
        >
          <input
            type="radio"
            name={name}
            value={answer}
            defaultChecked={current === (answer === "yes")}
            required
            className="accent-violet-600"
          />
          {answer === "yes" ? "Yes" : "No"}
        </label>
      ))}
    </div>
  </fieldset>
);

const listInput = (
  name: string,
  label: string,
  hint: string,
  current: ReadonlyArray<string> | undefined,
) => (
  <div>
    <label htmlFor={name} className={FIELD_STYLES.label}>
      {label}
    </label>
    <input
      id={name}
      name={name}
      defaultValue={(current ?? []).join(", ")}
      placeholder={hint}
      className={FIELD_STYLES.input}
    />
    <p className={FIELD_STYLES.hint}>Separate with commas.</p>
  </div>
);

export function ProfileStepFields({
  id,
  profile,
  options,
}: {
  readonly id: ProfileStepId;
  readonly profile: NannyProfile;
  readonly options: NannyFunnelOptions;
}) {
  switch (id) {
    case "location":
      return (
        <div className="space-y-4">
          <DistrictCombobox
            areasApi={options.areasApi}
            defaultValue={
              profile.area && profile.district
                ? { name: profile.area, district: profile.district }
                : null
            }
          />
          <div>
            <label htmlFor="mobile" className={FIELD_STYLES.label}>
              UK mobile
            </label>
            <input
              id="mobile"
              name="mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={profile.mobile ?? ""}
              required
              className={FIELD_STYLES.input}
            />
          </div>
        </div>
      );
    case "date-of-birth":
      return (
        <div>
          <label htmlFor="dateOfBirth" className={FIELD_STYLES.label}>
            Date of birth
          </label>
          <input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            autoComplete="bday"
            defaultValue={profile.dateOfBirth ?? ""}
            required
            className={FIELD_STYLES.input}
          />
        </div>
      );
    case "experience":
      return (
        <div className="space-y-6">
          <div>
            <label htmlFor="yearsExperience" className={FIELD_STYLES.label}>
              Years working with children
            </label>
            <input
              id="yearsExperience"
              name="yearsExperience"
              type="number"
              inputMode="numeric"
              min={FUNNEL_OPTIONS.yearsExperience.min}
              max={FUNNEL_OPTIONS.yearsExperience.max}
              defaultValue={profile.yearsExperience ?? ""}
              required
              className={FIELD_STYLES.input}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className={FIELD_STYLES.label}>
              Ages you&rsquo;ve looked after
            </legend>
            {FUNNEL_OPTIONS.ageGroups.map((option) => (
              <label key={option.key} className={FIELD_STYLES.choice}>
                <input
                  type="checkbox"
                  name="ageGroups"
                  value={option.key}
                  className="mt-0.5 accent-violet-600"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        </div>
      );
    case "qualification":
      return (
        <fieldset className="space-y-2">
          <legend className={FIELD_STYLES.label}>
            Your highest childcare qualification
          </legend>
          {options.qualifications.map((rung) => (
            <label key={rung.key} className={FIELD_STYLES.choice}>
              <input
                type="radio"
                name="qualification"
                value={rung.key}
                defaultChecked={profile.qualification === rung.key}
                required
                className="mt-0.5 accent-violet-600"
              />
              <span>{rung.label}</span>
            </label>
          ))}
        </fieldset>
      );
    case "certificates":
      return listInput(
        "certificates",
        "Certificates you hold",
        "e.g. paediatric first aid, safeguarding",
        profile.certificates,
      );
    case "languages":
      return listInput(
        "languages",
        "Languages you speak",
        "e.g. English, Portuguese",
        profile.languages,
      );
    case "practical":
      return (
        <div className="space-y-4">
          {yesNo("hasCar", "Do you have a car?", profile.hasCar)}
          {yesNo(
            "hasDrivingLicence",
            "Do you hold a full UK driving licence?",
            profile.hasDrivingLicence,
          )}
          {yesNo("isNonSmoker", "Are you a non-smoker?", profile.isNonSmoker)}
          {yesNo(
            "comfortableWithPets",
            "Are you comfortable around pets?",
            profile.comfortableWithPets,
          )}
        </div>
      );
    case "availability":
      return <AvailabilityGrid defaultValue={profile.availability ?? null} />;
    case "rate":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="hourlyRateMin" className={FIELD_STYLES.label}>
              Your minimum hourly rate ({options.currency})
            </label>
            <input
              id="hourlyRateMin"
              name="hourlyRateMin"
              type="number"
              inputMode="numeric"
              min={FUNNEL_OPTIONS.rate.minPerHour}
              max={FUNNEL_OPTIONS.rate.maxPerHour}
              defaultValue={
                profile.hourlyRateMinPence === undefined
                  ? ""
                  : Math.round(profile.hourlyRateMinPence / 100)
              }
              required
              className={FIELD_STYLES.input}
            />
          </div>
          <div>
            <label htmlFor="availableFrom" className={FIELD_STYLES.label}>
              Available from
            </label>
            <input
              id="availableFrom"
              name="availableFrom"
              type="date"
              defaultValue={profile.availableFrom ?? ""}
              className={FIELD_STYLES.input}
            />
          </div>
        </div>
      );
    case "about-you":
      return (
        <div>
          <label htmlFor="bio" className={FIELD_STYLES.label}>
            About you — what a family should know
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={6}
            defaultValue={profile.bio ?? ""}
            minLength={FUNNEL_OPTIONS.bioMinLength}
            required
            className={FIELD_STYLES.input}
          />
        </div>
      );
  }
}
