"use client";
// N1 Contact (04 §4.1 row 5; 04 §6.1 S-X-15 "`autocomplete` tokens on name / email / tel", fix: a11y-12): name,
// email, UK mobile. Page 8 — the submit writes the lead. "Sign in instead" is the answer for an address that
// already has an account, rendered by the orchestrator.
import { FIELD_STYLES } from "./field-styles";

export function ContactStep({
  badField,
}: {
  readonly badField?: string | null;
}) {
  const invalid = (name: string) =>
    badField === name ? { "aria-invalid": true as const } : {};
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className={FIELD_STYLES.label}>
            First name
          </label>
          <input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            required
            className={FIELD_STYLES.input}
            {...invalid("firstName")}
          />
        </div>
        <div>
          <label htmlFor="lastName" className={FIELD_STYLES.label}>
            Last name
          </label>
          <input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            required
            className={FIELD_STYLES.input}
            {...invalid("lastName")}
          />
        </div>
      </div>
      <div>
        <label htmlFor="email" className={FIELD_STYLES.label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={FIELD_STYLES.input}
          {...invalid("email")}
        />
      </div>
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
          placeholder="07…"
          required
          className={FIELD_STYLES.input}
          {...invalid("mobile")}
        />
        <p className={FIELD_STYLES.hint}>
          We&rsquo;ll only use this to arrange introductions.
        </p>
      </div>
    </div>
  );
}
