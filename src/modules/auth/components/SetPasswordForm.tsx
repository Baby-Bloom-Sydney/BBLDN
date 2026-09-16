"use client";
// S-X-09, set-password variant (ADR-042; 04 §6). The person arriving here has **not** made a mistake — they were
// created without a password — so the page reads as a next step, never as an error: no error styling until they
// actually submit something invalid, and the failure message is the policy, not a rejection.
// `useFormState` is the React 18 / Next 14 pairing (`useActionState` is React 19 — ADR-104 pins the current
// major, and the upgrade is its own unit).
import { useFormState, useFormStatus } from "react-dom";
import type { ClientResult } from "@/modules/platform";

export type SetPasswordFormProps = {
  readonly action: (
    previous: unknown,
    formData: FormData,
  ) => Promise<ClientResult<void>>;
  readonly minLength: number;
  readonly signInHref: string;
};

export function SetPasswordForm(props: SetPasswordFormProps) {
  const [state, formAction] = useFormState(props.action, null);
  const failed = state !== null && !state.ok;
  const done = state !== null && state.ok;

  return (
    <form action={formAction} noValidate>
      <h1>Set your password</h1>
      <p>Choose a password and you are all set — nothing has gone wrong.</p>

      <label htmlFor="password">New password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={props.minLength}
        required
        aria-describedby="password-hint"
        {...(failed ? { "aria-invalid": true } : {})}
      />
      <p id="password-hint">At least {props.minLength} characters.</p>

      <div aria-live="polite">
        {failed ? <p role="alert">{state.error.message}</p> : null}
        {done ? (
          <p>
            Your password is set. <a href={props.signInHref}>Sign in</a>
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save password"}
    </button>
  );
}
