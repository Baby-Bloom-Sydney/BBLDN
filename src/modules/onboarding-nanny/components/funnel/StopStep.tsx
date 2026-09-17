"use client";
// The two plain stops of N1 (04 §4.1 rows 2 and 4; 04 §6.1 S-X-15 "stop states move focus to the stop heading
// and announce it", fix: a11y-13). Outside Greater London (T-4.1) and no Enhanced DBS (shape open — the wording
// is a draft, 04 §10 item 21 ☐). Nothing is written; the visitor can go back.
import { useEffect, useRef } from "react";
import type { FunnelStopKind } from "../../types";
import { FIELD_STYLES } from "./field-styles";

const STOPS: Readonly<
  Record<FunnelStopKind, { readonly heading: string; readonly body: string }>
> = {
  "outside-london": {
    heading: "We currently work across Greater London",
    body: "If you're outside London we can't introduce you to a family yet. If your area is in London and you couldn't find it, try the first part of your postcode.",
  },
  "no-dbs": {
    heading: "You'll need an Enhanced DBS certificate first",
    body: "Every professional we introduce holds one, and families expect it. Once yours arrives, come back and apply — it takes about ten minutes.",
  },
};

export function StopStep({
  kind,
  onBack,
}: {
  readonly kind: FunnelStopKind;
  readonly onBack: () => void;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [kind]);
  const stop = STOPS[kind];
  return (
    <section
      aria-labelledby="funnel-stop-heading"
      aria-live="polite"
      className="py-8"
    >
      <h1
        id="funnel-stop-heading"
        ref={ref}
        tabIndex={-1}
        className="text-2xl font-bold text-slate-900 focus:outline-none"
      >
        {stop.heading}
      </h1>
      <p className="mt-3 text-sm text-slate-700">{stop.body}</p>
      <button
        type="button"
        onClick={onBack}
        className={`mt-6 ${FIELD_STYLES.secondary}`}
      >
        Go back
      </button>
    </section>
  );
}
