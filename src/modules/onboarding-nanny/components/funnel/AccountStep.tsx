"use client";
// N5 (04 §4.1 row 7; S-X-19): password + the AGR-02 tick (E&W text, T-3.3). Name and email are the lead's —
// asked once (04 §6.3 a11y-18). The same fields serve S-X-07 through `NannySignupForm`.
import { FIELD_STYLES } from "./field-styles";

export function AccountFields({
  minPasswordLength,
  professionalTermsHref,
  privacyHref,
  badField,
}: {
  readonly minPasswordLength: number;
  readonly professionalTermsHref: string;
  readonly privacyHref: string;
  readonly badField?: string | null;
}) {
  const invalid = (name: string) =>
    badField === name ? { "aria-invalid": true as const } : {};
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="password" className={FIELD_STYLES.label}>
          Choose a password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={minPasswordLength}
          required
          className={FIELD_STYLES.input}
          {...invalid("password")}
        />
        <p className={FIELD_STYLES.hint}>
          At least {minPasswordLength} characters.
        </p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className={FIELD_STYLES.label}>
          Type it again
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className={FIELD_STYLES.input}
          {...invalid("confirmPassword")}
        />
      </div>
      <label className={FIELD_STYLES.choice}>
        <input
          type="checkbox"
          name="consent"
          value="on"
          required
          className="mt-0.5 accent-violet-600"
          {...invalid("consent")}
        />
        <span>
          I have read and agree to the{" "}
          <a href={professionalTermsHref} className={FIELD_STYLES.link}>
            professional terms
          </a>{" "}
          and the{" "}
          <a href={privacyHref} className={FIELD_STYLES.link}>
            privacy policy
          </a>
          .
        </span>
      </label>
    </div>
  );
}
