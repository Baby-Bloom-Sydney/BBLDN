"use client";
// S-X-05 / S-X-06 (04 §3.1 step 5; §6.1): first name, last name, email, UK mobile, password, confirm, the AGR-01
// tick, and the promise line above the button (D5). Failure = an error summary that takes focus and names the
// field (04 §6.1 "error summary takes focus"; `aria-invalid` on that field); `autocomplete` tokens and
// `inputmode="tel"` per fix a11y-12. `useFormState` is the React 18 / Next 14 pairing (ADR-104). The action is a
// prop so this client bundle never reaches the connector barrel (01 §2.5). On success the browser follows the
// destination the action returned (`03.36`).
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ParentSignupFormProps } from "../types";
import { SIGNUP_COPY } from "../lib/signup-copy";

const field =
  "mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 aria-[invalid=true]:border-red-500";
const label = "text-sm font-medium text-slate-900";

export function ParentSignupForm(props: ParentSignupFormProps) {
  const [state, formAction] = useFormState(props.action, null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const failed = state !== null && !state.ok;
  const badField = failed ? state.error.details?.field : undefined;
  const invalid = (name: string) =>
    badField === name ? { "aria-invalid": true as const } : {};

  useEffect(() => {
    if (failed) summaryRef.current?.focus();
    if (state !== null && state.ok)
      window.location.assign(state.value.destination);
  }, [failed, state]);

  return (
    <form action={formAction} noValidate aria-labelledby="signup-heading">
      <h1
        id="signup-heading"
        className="text-2xl font-bold [letter-spacing:-0.025em] text-slate-900"
      >
        Create your account
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {props.variant === "beside-matches" && props.matchCount !== undefined
          ? `${props.matchCount} nannies matched to your family. `
          : null}
        {SIGNUP_COPY.heading}.
      </p>
      {props.context.inviteToken !== undefined ? (
        <p className="mt-2 text-sm text-slate-600">
          You&apos;ve been invited to your child&apos;s app — create your
          account and we&apos;ll link you up.
        </p>
      ) : null}

      <div
        ref={summaryRef}
        tabIndex={-1}
        aria-live="assertive"
        className="mt-4 outline-none"
      >
        {failed ? (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {state.error.message}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className={label}>
            First name
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            maxLength={80}
            className={field}
            {...invalid("firstName")}
          />
        </div>
        <div>
          <label htmlFor="lastName" className={label}>
            Last name
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            autoComplete="family-name"
            required
            maxLength={80}
            className={field}
            {...invalid("lastName")}
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="email" className={label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className={field}
          {...invalid("email")}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="mobile" className={label}>
          UK mobile
        </label>
        <input
          id="mobile"
          name="mobile"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="07…"
          required
          aria-describedby="mobile-hint"
          className={field}
          {...invalid("mobile")}
        />
        <p id="mobile-hint" className="mt-1 text-xs text-slate-500">
          Your matchmaker calls this number.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className={label}>
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={props.minPasswordLength}
            required
            aria-describedby="password-hint"
            className={field}
            {...invalid("password")}
          />
          <p id="password-hint" className="mt-1 text-xs text-slate-500">
            At least {props.minPasswordLength} characters.
          </p>
        </div>
        <div>
          <label htmlFor="confirmPassword" className={label}>
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className={field}
            {...invalid("confirmPassword")}
          />
        </div>
      </div>

      <label className="mt-5 flex items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          name="consent"
          value="on"
          required
          className="mt-0.5 h-4 w-4 accent-violet-500"
          {...invalid("consent")}
        />
        <span>
          I have read and agree to the{" "}
          <a href={props.clientTermsHref} className="font-medium underline">
            client terms
          </a>{" "}
          and the{" "}
          <a href={props.privacyHref} className="font-medium underline">
            privacy policy
          </a>
          .
        </span>
      </label>

      <input type="hidden" name="source" value={props.context.source} />
      {props.context.leadId !== undefined ? (
        <input type="hidden" name="leadId" value={props.context.leadId} />
      ) : null}
      {props.context.inviteToken !== undefined ? (
        <input
          type="hidden"
          name="inviteToken"
          value={props.context.inviteToken}
        />
      ) : null}
      {props.context.nannyId !== undefined ? (
        <input type="hidden" name="nannyId" value={props.context.nannyId} />
      ) : null}

      <p
        data-promise-line
        className="mt-6 rounded-md border border-violet-100 bg-violet-50 p-3 text-sm text-violet-900"
      >
        {SIGNUP_COPY.promiseLine}
      </p>

      <SubmitButton />

      <p className="mt-4 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <a href={props.signInHref} className="font-medium underline">
          Sign in
        </a>
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-violet-500 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Creating your account…" : "Create my account"}
    </button>
  );
}
