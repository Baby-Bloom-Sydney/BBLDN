"use client";
// One form shell for every wizard step that submits to a server action: `noValidate` so the summary, not the
// browser, names the field; multipart so the files travel; a refusal focuses the summary and names the bad
// field to the step; success hands the value to the wizard.
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ClientResult } from "@/modules/platform";
import type { VerificationActionDetails } from "../../types";
import { ErrorSummary } from "./ErrorSummary";
import { FIELD_STYLES } from "./field-styles";

type StepResult = ClientResult<unknown, VerificationActionDetails>;
type StepAction = (
  previous: unknown,
  formData: FormData,
) => Promise<StepResult>;

function SubmitButton({ label }: { readonly label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={FIELD_STYLES.primary}
      aria-busy={pending}
    >
      {pending ? "Sending…" : label}
    </button>
  );
}

export function StepForm({
  action,
  onDone,
  submitLabel,
  children,
}: {
  readonly action: StepAction;
  readonly onDone: (value: unknown) => void;
  readonly submitLabel: string;
  readonly children: (badField: string | null) => React.ReactNode;
}) {
  const [state, formAction] = useFormState(action, null as StepResult | null);
  // the latest `onDone` without making it a dependency: the effect fires once per answered submit, never
  // again because the parent re-rendered with a fresh closure
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const failed = state !== null && !state.ok;
  const badField =
    failed &&
    (state.error.details?.reason === "invalid-input" ||
      "field" in (state.error.details ?? {}))
      ? ((state.error.details as { field?: string }).field ?? null)
      : null;

  useEffect(() => {
    if (state !== null && state.ok) onDoneRef.current(state.value);
  }, [state]);

  return (
    <form
      action={formAction}
      noValidate
      encType="multipart/form-data"
      data-bad-field={badField ?? undefined}
    >
      {children(badField)}
      <ErrorSummary message={failed ? state.error.message : null} />
      <div className="mt-6">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
