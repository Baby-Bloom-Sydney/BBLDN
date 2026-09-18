"use client";
// S-N-06 — the Enhanced DBS certificate (image or PDF), its number and issue date, and consent to the Update
// Service status check (04 §4.1 row 11; `05.29`; kickoff §4.3 default).
import type { WizardOptions } from "../../types";
import { FIELD_STYLES } from "./field-styles";
import { FileField } from "./FileField";

export function DbsStep({
  options,
  badField,
}: {
  readonly options: WizardOptions;
  readonly badField: string | null;
}) {
  const invalid = (name: string) =>
    badField === name ? { "aria-invalid": true as const } : {};
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-700">
        We need your Enhanced DBS certificate. A person checks the certificate
        itself, then confirms it against the DBS Update Service with your
        permission.
      </p>
      <FileField
        name="certificate"
        label="Your DBS certificate"
        hint="A clear photo or a PDF of the whole certificate."
        acceptedMimes={options.acceptedMimes}
        maxBytes={options.maxBytes}
        invalid={badField === "certificate"}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="certificateNumber" className={FIELD_STYLES.label}>
            Certificate number
          </label>
          <input
            id="certificateNumber"
            name="certificateNumber"
            inputMode="numeric"
            autoComplete="off"
            required
            className={FIELD_STYLES.input}
            {...invalid("certificateNumber")}
          />
          <p className={FIELD_STYLES.hint}>
            The {options.dbsNumberLength}-digit number printed on the
            certificate.
          </p>
        </div>
        <div>
          <label htmlFor="issueDate" className={FIELD_STYLES.label}>
            Date of issue
          </label>
          <input
            id="issueDate"
            name="issueDate"
            type="date"
            required
            className={FIELD_STYLES.input}
            {...invalid("issueDate")}
          />
        </div>
      </div>
      <label className={FIELD_STYLES.choice}>
        <input
          type="checkbox"
          name="updateServiceConsent"
          value="on"
          className="mt-0.5"
          {...invalid("updateServiceConsent")}
        />
        <span>
          I consent to my certificate being checked against the DBS Update
          Service now and while I&rsquo;m with you, and I understand what the
          certificate shows is seen only by the people who verify it.
        </span>
      </label>
    </div>
  );
}
