"use client";

// The claim button (04 §6.1 S-P-14 / S-N-20). A client component only because it needs the pending state and
// the error line; the token travels in a hidden field of a server-action form rather than in a fetch the page
// composes, so it never reaches a query string, a `Referer` or a client-side log (07 §8 row 7).
//
// The error is announced assertively (a11y-19) and takes focus order before the button, so a screen-reader
// user hears why nothing happened rather than finding the button unchanged.
import { useFormState, useFormStatus } from "react-dom";
import { claimInviteAction } from "../actions/claim-invite-action";

function Submit({ label }: { readonly label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
    >
      {pending ? "Joining…" : label}
    </button>
  );
}

export function ClaimInviteForm({
  token,
  label,
}: {
  readonly token: string;
  readonly label: string;
}) {
  const [state, action] = useFormState(claimInviteAction, { error: null });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.error === null || state?.error === undefined ? null : (
        <p
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {state.error}
        </p>
      )}
      <Submit label={label} />
    </form>
  );
}
