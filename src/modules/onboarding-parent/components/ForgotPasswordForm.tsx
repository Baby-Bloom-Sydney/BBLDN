"use client";
// S-X-09, forgot half (04 §6.1: sent · done → S-X-08). One "check your email" state whether or not the address is
// known (07 §4). While the connector cannot send the email, the failure names the support mailbox instead of a
// dead end.
import { useFormState, useFormStatus } from "react-dom";
import type { ForgotPasswordFormProps } from "../types";

export function ForgotPasswordForm(props: ForgotPasswordFormProps) {
  const [state, formAction] = useFormState(props.action, null);
  const failed = state !== null && !state.ok;
  const sent = state !== null && state.ok;

  if (sent) {
    return (
      <div role="status">
        <h1 className="text-2xl font-bold [letter-spacing:-0.025em] text-slate-900">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          If there is an account for that address, a link to set a new password
          is on its way. It works for one hour.
        </p>
        <a
          href={props.signInHref}
          className="mt-6 inline-block text-sm font-medium underline"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate aria-labelledby="forgot-heading">
      <h1
        id="forgot-heading"
        className="text-2xl font-bold [letter-spacing:-0.025em] text-slate-900"
      >
        Set a new password
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter the email on your account and we&apos;ll send you a link. This is
        also the way in if you created your account without a password.
      </p>

      <div className="mt-4">
        <label htmlFor="email" className="text-sm font-medium text-slate-900">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
          {...(failed ? { "aria-invalid": true } : {})}
        />
      </div>

      <div aria-live="polite" className="mt-4">
        {failed ? (
          <p role="alert" className="text-sm text-red-700">
            {state.error.message}{" "}
            <span className="text-slate-600">
              Email us at{" "}
              <a
                href={`mailto:${props.supportEmail}`}
                className="font-medium underline"
              >
                {props.supportEmail}
              </a>{" "}
              and we&apos;ll sort it.
            </span>
          </p>
        ) : null}
      </div>

      <SubmitButton />

      <a
        href={props.signInHref}
        className="mt-4 inline-block text-sm text-slate-600 underline"
      >
        Back to sign in
      </a>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-violet-500 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {pending ? "Sending…" : "Email me a link"}
    </button>
  );
}
