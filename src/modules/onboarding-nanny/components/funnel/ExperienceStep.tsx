"use client";
// N1 Experience (04 §4.1 row 5): years and age groups. The under-3 signal is captured from the groups and never
// shown to her — the screen asks a plain question.
import { FUNNEL_OPTIONS } from "../../lib/funnel-options";
import { FIELD_STYLES } from "./field-styles";

export function ExperienceStep({
  defaultYears,
  defaultGroups,
}: {
  readonly defaultYears?: string;
  readonly defaultGroups?: ReadonlyArray<string>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="yearsExperience" className={FIELD_STYLES.label}>
          How many years have you worked with children?
        </label>
        <input
          id="yearsExperience"
          name="yearsExperience"
          type="number"
          inputMode="numeric"
          min={FUNNEL_OPTIONS.yearsExperience.min}
          max={FUNNEL_OPTIONS.yearsExperience.max}
          defaultValue={defaultYears}
          required
          className={FIELD_STYLES.input}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className={FIELD_STYLES.label}>Which ages have you looked after?</legend>
        {FUNNEL_OPTIONS.ageGroups.map((option) => (
          <label key={option.key} className={FIELD_STYLES.choice}>
            <input
              type="checkbox"
              name="ageGroups"
              value={option.key}
              defaultChecked={defaultGroups?.includes(option.key)}
              className="mt-0.5 accent-violet-600"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
