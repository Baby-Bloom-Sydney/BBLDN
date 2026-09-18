"use client";
// S-N-05 — UK id type, document + selfie, the declared names and date of birth, the biometric-notice gate
// (04 §4.1 row 10; 04 §6.3 incl. the selfie alternatives of a11y-5).
import type {
  BiometricNotice,
  WizardOptions,
  WizardPrefill,
} from "../../types";
import { BiometricNoticePanel } from "./BiometricNoticePanel";
import { FIELD_STYLES } from "./field-styles";
import { FileField } from "./FileField";

export function IdentityStep({
  options,
  prefill,
  notice,
  badField,
}: {
  readonly options: WizardOptions;
  readonly prefill: WizardPrefill;
  readonly notice: BiometricNotice | null;
  readonly badField: string | null;
}) {
  const invalid = (name: string) =>
    badField === name ? { "aria-invalid": true as const } : {};
  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className={FIELD_STYLES.label}>
          Which document will you use?
        </legend>
        {options.idTypes.map((type, index) => (
          <label key={type.key} className={FIELD_STYLES.choice}>
            <input
              type="radio"
              name="idType"
              value={type.key}
              defaultChecked={index === 0}
              className="mt-0.5"
            />
            <span>{type.label}</span>
          </label>
        ))}
      </fieldset>
      <FileField
        name="document"
        label="A photo or scan of the document"
        hint="The page with your photo and name."
        acceptedMimes={options.acceptedMimes}
        maxBytes={options.maxBytes}
        invalid={badField === "document"}
      />
      <FileField
        name="selfie"
        label="A selfie"
        hint="Use your camera, or upload a recent photo instead. If neither works for you, we can do this with you by phone."
        acceptedMimes={options.acceptedMimes.filter((mime) =>
          mime.startsWith("image/"),
        )}
        maxBytes={options.maxBytes}
        capture="user"
        invalid={badField === "selfie"}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="givenNames" className={FIELD_STYLES.label}>
            Given names, as on the document
          </label>
          <input
            id="givenNames"
            name="givenNames"
            autoComplete="given-name"
            defaultValue={prefill.firstName}
            required
            className={FIELD_STYLES.input}
            {...invalid("givenNames")}
          />
        </div>
        <div>
          <label htmlFor="surname" className={FIELD_STYLES.label}>
            Surname, as on the document
          </label>
          <input
            id="surname"
            name="surname"
            autoComplete="family-name"
            defaultValue={prefill.lastName}
            required
            className={FIELD_STYLES.input}
            {...invalid("surname")}
          />
        </div>
      </div>
      <div>
        <label htmlFor="dateOfBirth" className={FIELD_STYLES.label}>
          Date of birth
        </label>
        <input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          autoComplete="bday"
          defaultValue={prefill.dateOfBirth ?? ""}
          required
          className={FIELD_STYLES.input}
          {...invalid("dateOfBirth")}
        />
      </div>
      <BiometricNoticePanel
        notice={notice}
        disclosures={options.disclosures}
        invalid={badField === "consent"}
      />
    </div>
  );
}
