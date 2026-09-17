"use client";
// N1 Credentials (04 §4.1 row 4; T-3.1, N-4): "Do you hold an Enhanced DBS certificate?" — Sydney's hard stop in
// DBS shape. A "no" goes to the stop screen; what it is told is a draft (04 §10 item 21 ☐).
import { FIELD_STYLES } from "./field-styles";

export function CredentialsStep({ defaultValue }: { readonly defaultValue?: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className={FIELD_STYLES.label}>Do you hold an Enhanced DBS certificate?</legend>
      <p className={FIELD_STYLES.hint}>
        Families need to see one before you meet. If yours is on the Update Service, even better — you&rsquo;ll be
        asked for the certificate later, not now.
      </p>
      {(["yes", "no"] as const).map((answer) => (
        <label key={answer} className={FIELD_STYLES.choice}>
          <input
            type="radio"
            name="hasEnhancedDbs"
            value={answer}
            defaultChecked={defaultValue === answer}
            required
            className="mt-0.5 accent-violet-600"
          />
          <span>{answer === "yes" ? "Yes, I have one" : "No, not yet"}</span>
        </label>
      ))}
    </fieldset>
  );
}
