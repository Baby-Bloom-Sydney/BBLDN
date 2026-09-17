"use client";
// N1 Residency (04 §4.1 row 3; T-0.8): the right-to-work status in UK words — the question only; the evidence
// is the wizard's (2b, S-N-07). Radios from the funnel's list; `unknown` is never offered.
import { FUNNEL_OPTIONS } from "../../lib/funnel-options";
import { FIELD_STYLES } from "./field-styles";

export function ResidencyStep({
  defaultValue,
}: {
  readonly defaultValue?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className={FIELD_STYLES.label}>
        Which of these describes you?
      </legend>
      {FUNNEL_OPTIONS.rtwStatus.map((option) => (
        <label key={option.key} className={FIELD_STYLES.choice}>
          <input
            type="radio"
            name="rtwStatus"
            value={option.key}
            defaultChecked={defaultValue === option.key}
            required
            className="mt-0.5 accent-violet-600"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
