// S-P-03 — the steps in motion (04 §7.1; D8 / ADR-046; T-6.4 / ADR-036). The rail is an `<ol>`; each step shows
// its state as text (Done · In progress · Next) beside the mark, never colour or pulse alone;
// `aria-current="step"` on the in-motion step; the pulse is `motion-safe` only (fix: a11y-4 / a11y-11). A step is
// never hidden and never an empty room (P-2): when the read fails the labels still stand, with the error line.
import type { JourneyStep } from "@/modules/shared-types";
import type { ParentJourneyRailProps } from "../types";
import { RAIL_LABELS } from "../lib/rail-labels";

const STATE_WORDS: Readonly<Record<JourneyStep["state"], string>> =
  Object.freeze({
    done: "Done",
    "in-motion": "In progress",
    pending: "Next",
    hidden: "",
  });

const MARK: Readonly<Record<JourneyStep["state"], string>> = Object.freeze({
  done: "bg-green-600 text-white",
  "in-motion": "bg-violet-600 text-white motion-safe:animate-pulse",
  pending: "border border-slate-300 bg-white text-slate-400",
  hidden: "",
});

function Step({ step }: { readonly step: JourneyStep }) {
  return (
    <li
      aria-current={step.state === "in-motion" ? "step" : undefined}
      className="flex gap-4 py-3"
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${MARK[step.state]}`}
      >
        {step.state === "done" ? "✓" : step.row}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">
          {step.label}
          <span className="ml-2 text-xs font-medium uppercase [letter-spacing:0.08em] text-slate-500">
            {STATE_WORDS[step.state]}
          </span>
        </p>
        {step.detail !== undefined && (
          <p className="mt-0.5 text-sm text-slate-600">{step.detail}</p>
        )}
      </div>
    </li>
  );
}

export function ParentJourneyRail({ steps, failed }: ParentJourneyRailProps) {
  const shown: ReadonlyArray<JourneyStep> = failed
    ? RAIL_LABELS.map((row) => ({ ...row, state: "pending" as const }))
    : steps.filter((step) => step.state !== "hidden");
  const inMotion = shown.find((step) => step.state === "in-motion");
  return (
    <section
      aria-labelledby="journey-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
    >
      <h2 id="journey-heading" className="text-lg font-semibold text-slate-900">
        Your steps
      </h2>
      {failed && (
        <p role="status" className="mt-2 text-sm text-amber-800">
          We couldn&apos;t load where you are just now — try again in a moment.
          Your matchmaker is on it either way.
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {inMotion?.detail ?? ""}
      </p>
      <ol className="mt-3 divide-y divide-slate-100">
        {shown.map((step) => (
          <Step key={step.row} step={step} />
        ))}
      </ol>
    </section>
  );
}
