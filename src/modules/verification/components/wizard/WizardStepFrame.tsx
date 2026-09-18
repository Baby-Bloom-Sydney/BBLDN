"use client";
// 04 §6.3 S-N-03…S-N-08 — "step n of 5 in the h1, `aria-current="step"`, focus to the step heading" (fix:
// a11y-17), and the "I'll verify later" escape on every step (04 §4.1 row 9), keyboard-reachable (a11y-18).
import { useEffect, useRef } from "react";
import { FIELD_STYLES } from "./field-styles";

export function WizardStepFrame({
  position,
  count,
  heading,
  laterHref,
  children,
}: {
  readonly position: number;
  readonly count: number;
  readonly heading: string;
  readonly laterHref: string;
  readonly children: React.ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [position]);
  return (
    <section aria-labelledby="wizard-step-heading" className="relative py-8">
      <a
        href={laterHref}
        className={`absolute right-0 top-3 ${FIELD_STYLES.link} text-xs`}
      >
        I&rsquo;ll verify later
      </a>
      <p
        className="text-xs font-medium uppercase [letter-spacing:0.05em] text-violet-700"
        aria-current="step"
      >
        Step {position} of {count}
      </p>
      <h1
        id="wizard-step-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mt-1 text-2xl font-bold [letter-spacing:-0.025em] text-slate-900 focus:outline-none"
      >
        {heading}
      </h1>
      <div className="mt-6">{children}</div>
    </section>
  );
}
