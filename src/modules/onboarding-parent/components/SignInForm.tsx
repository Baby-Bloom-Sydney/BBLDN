"use client";
// S-X-08 (04 §6.1): email + password, one refusal line that points at S-X-09 without saying whether the address is
// known (07 §4). The line is written for the passwordless account too (D4 safety net) — "if you've never set a
// password" — so the reassurance is there even though the anonymous catch itself is a pinned connector gap.
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { SignInFormProps } from "../types";

const field =
  "mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30";

export function SignInForm(props: SignInFormProps) {
  const [state, formAction] = useFormState(props.action, null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const failed = state !== null && !state.ok;

  useEffect(() => {
    if (failed) summaryRef.current?.focus();
    if (state !== null && state.ok)
      window.location.assign(state.value.destination);
  }, [failed, state]);

  return (
    <form action={formAction} noValidate aria-labelledby="signin-heading">
      <h1
        id="signin-heading"
        className="text-2xl font-bold [letter-spacing:-0.025em] text-slate-900"
      >
        Sign in
      </h1>

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
            {state.error.message}{" "}
            <a
              href={props.forgotPasswordHref}
              className="font-medium underline"
            >
              Email me a link
            </a>
          </p>
        ) : null}
      </div>

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
          className={field}
        />
      </div>
      <div className="mt-4">
        <label
          htmlFor="password"
          className="text-sm font-medium text-slate-900"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={field}
        />
      </div>
      {props.nextPath !== undefined ? (
        <input type="hidden" name="next" value={props.nextPath} />
      ) : null}

      <SubmitButton />

      <div className="mt-4 flex justify-between text-sm text-slate-600">
        <a href={props.forgotPasswordHref} className="underline">
          Forgot your password?
        </a>
        <a href={props.signupHref} className="font-medium underline">
          Create an account
        </a>
      </div>
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
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
