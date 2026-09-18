"use client";
// S-N-04 — location + UK mobile (04 §6.3: area combobox from the route's slot, mobile prefilled and never asked
// twice, `autocomplete` tokens).
import type { WizardPrefill } from "../../types";
import { FIELD_STYLES } from "./field-styles";

export function ContactStep({
  prefill,
  locationField,
  badField,
}: {
  readonly prefill: WizardPrefill;
  readonly locationField: React.ReactNode;
  readonly badField: string | null;
}) {
  return (
    <div className="space-y-4">
      {locationField}
      <p className={FIELD_STYLES.hint}>
        Start typing your area or the first part of your postcode.
      </p>
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
          defaultValue={prefill.mobile ?? ""}
          placeholder="07…"
          required
          aria-invalid={badField === "mobile" ? true : undefined}
          className={FIELD_STYLES.input}
        />
        <p className={FIELD_STYLES.hint}>
          We&rsquo;ll only use this to arrange introductions.
        </p>
      </div>
    </div>
  );
}
