"use client";
// 04 §6.1 S-X-15 — "step n of N in the h1, `aria-current="step"`, focus to the new step heading" (fix: a11y-17).
// The frame every funnel page sits in: the position, the heading, the region, the focus move.
import { useEffect, useRef } from "react";

export function FunnelStepFrame({
  position,
  count,
  heading,
  children,
}: {
  readonly position: number;
  readonly count: number;
  readonly heading: string;
  readonly children: React.ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [position]);
  return (
    <section aria-labelledby="funnel-step-heading" className="py-8">
      <p className="text-xs font-medium uppercase tracking-wide text-violet-700" aria-current="step">
        Step {position} of {count}
      </p>
      <h1
        id="funnel-step-heading"
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
