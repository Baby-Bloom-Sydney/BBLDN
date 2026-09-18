"use client";
// S-N-07 — one of three kinds (04 §4.1 row 12; ADR-153): the chosen kind decides which fields show; a share code
// carries a format hint (04 §6.3).
import { useState } from "react";
import type { RightToWorkEvidenceKind, WizardOptions } from "../../types";
import { FIELD_STYLES } from "./field-styles";
import { FileField } from "./FileField";

export function RightToWorkStep({
  options,
  badField,
}: {
  readonly options: WizardOptions;
  readonly badField: string | null;
}) {
  const [kind, setKind] = useState<RightToWorkEvidenceKind>(
    options.rtwKinds[0]?.key ?? "british_irish_passport",
  );
  const invalid = (name: string) =>
    badField === name ? { "aria-invalid": true as const } : {};
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-700">
        This is separate from the checks above: it doesn&rsquo;t change when
        you&rsquo;re introduced, and every family you work with makes its own
        check as your employer.
      </p>
      <fieldset className="space-y-2">
        <legend className={FIELD_STYLES.label}>What will you show us?</legend>
        {options.rtwKinds.map((option) => (
          <label key={option.key} className={FIELD_STYLES.choice}>
            <input
              type="radio"
              name="kind"
              value={option.key}
              checked={kind === option.key}
              onChange={() => setKind(option.key)}
              className="mt-0.5"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      {kind === "share_code" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="shareCode" className={FIELD_STYLES.label}>
              Share code
            </label>
            <input
              id="shareCode"
              name="shareCode"
              autoComplete="off"
              required
              className={FIELD_STYLES.input}
              {...invalid("shareCode")}
            />
            <p className={FIELD_STYLES.hint}>
              {options.shareCodeLength} letters and numbers, e.g. W1A 2B3 4C5.
            </p>
          </div>
          <div>
            <label htmlFor="rtwDateOfBirth" className={FIELD_STYLES.label}>
              Date of birth
            </label>
            <input
              id="rtwDateOfBirth"
              name="dateOfBirth"
              type="date"
              autoComplete="bday"
              required
              className={FIELD_STYLES.input}
              {...invalid("dateOfBirth")}
            />
          </div>
        </div>
      ) : (
        <FileField
          name="document"
          label={
            kind === "british_irish_passport"
              ? "Your passport"
              : "Your immigration document"
          }
          hint="The page with your photo and details."
          acceptedMimes={options.acceptedMimes}
          maxBytes={options.maxBytes}
          invalid={badField === "document"}
        />
      )}
    </div>
  );
}
