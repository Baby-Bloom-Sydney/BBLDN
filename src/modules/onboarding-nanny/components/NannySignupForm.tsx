"use client";
// S-X-07 `/signup/nanny` (04 §6.1) — the invite-path account form: name, email, password, the AGR-02 tick. With
// the invite cookie present (ADR-150) the copy names the family's app; without one (rare, 04 §6.3) she lands on
// the hub and applies from there. No mobile here (04 §4.2 b2). The action is a prop (01 §2.5).
import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { NannySignupFormProps } from "../types";
import { AccountFields } from "./funnel/AccountStep";
import { ErrorSummary } from "./funnel/ErrorSummary";
import { FIELD_STYLES } from "./funnel/field-styles";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={FIELD_STYLES.primary}>
      {pending ? "Setting up…" : "Create my account"}
    </button>
  );
}

export function NannySignupForm(props: NannySignupFormProps) {
  const [state, formAction] = useFormState(props.action, null);
  const failed = state !== null && !state.ok;
  const badField = failed && state.error.details?.reason === "invalid-input" ? state.error.details.field : null;
  const invalid = (name: string) => (badField === name ? { "aria-invalid": true as const } : {});

  useEffect(() => {
    if (state !== null && state.ok) window.location.assign(state.value.destination);
  }, [state]);

  return (
    <form action={formAction} noValidate aria-labelledby="nanny-signup-heading">
      <input type="hidden" name="path" value="invite" />
      <h1 id="nanny-signup-heading" className="text-2xl font-bold [letter-spacing:-0.025em] text-slate-900">
        Create your account
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {props.hasInvite
          ? "You've been invited to a child's app. Set up your login and you'll join it straight away."
          : "Set up your login. You can apply to be matched with families once you're in."}
      </p>
      <div className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className={FIELD_STYLES.label}>First name</label>
            <input id="firstName" name="firstName" autoComplete="given-name" required className={FIELD_STYLES.input} {...invalid("firstName")} />
          </div>
          <div>
            <label htmlFor="lastName" className={FIELD_STYLES.label}>Last name</label>
            <input id="lastName" name="lastName" autoComplete="family-name" required className={FIELD_STYLES.input} {...invalid("lastName")} />
          </div>
        </div>
        <div>
          <label htmlFor="email" className={FIELD_STYLES.label}>Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className={FIELD_STYLES.input} {...invalid("email")} />
        </div>
        <AccountFields
          minPasswordLength={props.minPasswordLength}
          professionalTermsHref={props.professionalTermsHref}
          privacyHref={props.privacyHref}
          badField={badField}
        />
      </div>
      <ErrorSummary message={failed ? state.error.message : null} />
      <div className="mt-6">
        <Submit />
      </div>
      <p className="mt-4 text-sm text-slate-600">
        Already have an account?{" "}
        <a href={props.signInHref} className={FIELD_STYLES.link}>Sign in</a>
      </p>
    </form>
  );
}
