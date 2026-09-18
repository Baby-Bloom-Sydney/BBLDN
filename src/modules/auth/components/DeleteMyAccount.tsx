"use client";
// "Delete my account" — the self-service Art 17 road on `/parent/settings` and `/nanny/settings` (07 §6.1).
//
// Three things this screen has to do, and only one of them is the button:
//
//   1. **Tell her what is kept, and why, BEFORE she confirms.** 07 §6.1 says the confirmation states what is
//      retained and why; Art 12 is what makes that mandatory and Art 17(3) is what makes the retention lawful. The
//      sentences come from `LEGAL.erasureRetains` (ADR-179) — one list, read by this screen, by the job and by any
//      future subject-access answer, so the three cannot drift apart. Nothing here is typed as prose.
//   2. **Make the confirmation deliberate.** Typing DELETE is not decoration: this is irreversible, and a button
//      that can be hit by accident on a settings page is the wrong shape for the one action nobody can undo.
//   3. **Say what actually happened.** Erased, already erased, or refused with the reason — and a refusal tells
//      her the one thing she can do about it, because "we could not do that" with no reason is a dead end.
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LEGAL } from "@/modules/config";
import type { ErasureOutcome } from "@/modules/platform";
import type { DeleteMyAccountProps } from "../types";

const CONFIRM = "DELETE";

/** What a person can do about each refusal. A reason with no next step is a dead end wearing an explanation. */
const REFUSAL_TEXT: Readonly<Record<string, string>> = Object.freeze({
  "live-placement":
    "You have a placement that has not ended yet. End it first, then ask again.",
  "live-subscription":
    "Your subscription is still running. Cancel it first, then ask again.",
  retry:
    "Something about your account is being updated right now. Try again in a few minutes.",
});

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "done"; readonly outcome: ErasureOutcome }
  | { readonly kind: "failed"; readonly message: string };

/** Art 12: she is told what is kept, and why, BEFORE she confirms — not in the receipt afterwards. */
function RetainedList() {
  return (
    <>
      <h3>What we have to keep, and why</h3>
      <ul>
        {LEGAL.erasureRetains.map((row) => (
          <li key={row.class}>
            <strong>{row.what}.</strong> {row.why}
          </li>
        ))}
      </ul>
    </>
  );
}

export function DeleteMyAccount(props: DeleteMyAccountProps) {
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit() {
    const result = await props.action();
    setState(
      result.ok
        ? { kind: "done", outcome: result.value }
        : { kind: "failed", message: result.error.message },
    );
    if (result.ok && result.value.outcome === "erased") props.onErased?.();
  }

  return (
    <section aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading">Delete my account</h2>
      <p>
        This removes your profile, your messages and anything you have added. It
        cannot be undone.
      </p>
      <RetainedList />
      <form action={submit}>
        <label htmlFor="delete-confirm">Type {CONFIRM} to confirm</label>
        <input
          id="delete-confirm"
          name="confirm"
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
        <SubmitButton disabled={typed !== CONFIRM} />
      </form>
      <div aria-live="polite">
        {state.kind === "failed" ? <p role="alert">{state.message}</p> : null}
        {state.kind === "done" ? <Outcome outcome={state.outcome} /> : null}
      </div>
    </section>
  );
}

function Outcome(props: { readonly outcome: ErasureOutcome }) {
  if (props.outcome.outcome === "refused")
    return (
      <p role="alert">
        {REFUSAL_TEXT[props.outcome.reason ?? "retry"] ?? REFUSAL_TEXT.retry}
      </p>
    );
  // "already erased" and "erased" say the same thing to the person, because to her they are the same fact. The
  // difference matters to the audit trail, not to her.
  return (
    <p>
      Your account has been deleted. We have kept only what is listed above.
    </p>
  );
}

function SubmitButton(props: { readonly disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={props.disabled || pending}>
      {pending ? "Deleting…" : "Delete my account"}
    </button>
  );
}
