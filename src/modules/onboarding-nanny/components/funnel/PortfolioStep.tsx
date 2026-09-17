"use client";
// N3 Portfolio (04 §6.1 S-X-17): role types, the availability grid, the rate band. The photo is S-N-17's (ADR-148).
import { FUNNEL_OPTIONS } from "../../lib/funnel-options";
import type { NannyAvailability } from "../../types";
import { AvailabilityGrid } from "./AvailabilityGrid";
import { FIELD_STYLES } from "./field-styles";

export function PortfolioStep({
  currency,
  defaults,
}: {
  readonly currency: string;
  readonly defaults?: {
    readonly roleTypes?: ReadonlyArray<string>;
    readonly availability?: NannyAvailability | null;
    readonly rateMin?: string;
    readonly rateMax?: string;
  };
}) {
  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className={FIELD_STYLES.label}>
          What kind of work are you looking for?
        </legend>
        {FUNNEL_OPTIONS.roleTypes.map((option) => (
          <label key={option.key} className={FIELD_STYLES.choice}>
            <input
              type="checkbox"
              name="roleTypes"
              value={option.key}
              defaultChecked={defaults?.roleTypes?.includes(option.key)}
              className="mt-0.5 accent-violet-600"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <AvailabilityGrid defaultValue={defaults?.availability ?? null} />
      <fieldset>
        <legend className={FIELD_STYLES.label}>
          Your hourly rate ({currency})
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="rateMin" className={FIELD_STYLES.hint}>
              From
            </label>
            <input
              id="rateMin"
              name="rateMin"
              type="number"
              inputMode="numeric"
              min={FUNNEL_OPTIONS.rate.minPerHour}
              max={FUNNEL_OPTIONS.rate.maxPerHour}
              defaultValue={defaults?.rateMin}
              required
              className={FIELD_STYLES.input}
            />
          </div>
          <div>
            <label htmlFor="rateMax" className={FIELD_STYLES.hint}>
              To
            </label>
            <input
              id="rateMax"
              name="rateMax"
              type="number"
              inputMode="numeric"
              min={FUNNEL_OPTIONS.rate.minPerHour}
              max={FUNNEL_OPTIONS.rate.maxPerHour}
              defaultValue={defaults?.rateMax}
              required
              className={FIELD_STYLES.input}
            />
          </div>
        </div>
      </fieldset>
    </div>
  );
}
