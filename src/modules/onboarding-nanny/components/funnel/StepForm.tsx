"use client";
// One form shell for every funnel page. A page either **collects** (N1's four pages: the answers stay in the
// browser until page 8 — 04 §4.1 row 1) or **submits** to a server action (contact, portfolio, review, account,
// the portal). Either way: `noValidate` so the summary, not the browser, names the field; the hidden answers
// travel with every submit; a refusal focuses the summary; `no-lead` restarts the funnel (ADR-150).
import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { ClientResult } from "@/modules/platform";
import type { NannyFunnelErrorDetails } from "../../types";
import { ErrorSummary } from "./ErrorSummary";
import { FIELD_STYLES } from "./field-styles";

type StepResult = ClientResult<unknown, NannyFunnelErrorDetails>;
type StepAction = (
  previous: unknown,
  formData: FormData,
) => Promise<StepResult>;

const collectOnly: StepAction = async () => ({ ok: true, value: undefined });

function SubmitButton({ label }: { readonly label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={FIELD_STYLES.primary}>
      {pending ? "One moment…" : label}
    </button>
  );
}

export function StepForm({
  action,
  hidden,
  onCollect,
  onDone,
  onRestart,
  submitLabel,
  children,
}: {
  readonly action?: StepAction;
  readonly hidden?: Readonly<Record<string, string | ReadonlyArray<string>>>;
  readonly onCollect?: (answers: FormData) => void;
  readonly onDone: (value: unknown) => void;
  readonly onRestart?: () => void;
  readonly submitLabel: string;
  readonly children: React.ReactNode;
}) {
  const [state, formAction] = useFormState(
    action ?? collectOnly,
    null as StepResult | null,
  );
  const failed = state !== null && !state.ok;
  const badField = failed
    ? state.error.details?.reason === "invalid-input"
      ? state.error.details.field
      : null
    : null;

  useEffect(() => {
    if (state === null) return;
    if (state.ok) onDone(state.value);
    else if (state.error.details?.reason === "no-lead") onRestart?.();
    // the parent decides what "done" means; the state object is the dependency that says a submit answered
  }, [state]);

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(event) => onCollect?.(new FormData(event.currentTarget))}
      data-bad-field={badField ?? undefined}
    >
      {Object.entries(hidden ?? {}).flatMap(([name, value]) =>
        typeof value === "string"
          ? [<input key={name} type="hidden" name={name} value={value} />]
          : value.map((item, index) => (
              <input
                key={`${name}-${index}`}
                type="hidden"
                name={name}
                value={item}
              />
            )),
      )}
      {children}
      <ErrorSummary message={failed ? state.error.message : null} />
      <div className="mt-6">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
