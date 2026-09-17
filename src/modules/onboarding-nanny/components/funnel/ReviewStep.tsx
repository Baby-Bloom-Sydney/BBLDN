"use client";
// N4 (04 §4.1 row 6; S-X-18): the family-search line, then the profile review with the bio she writes (ADR-148:
// no AI call day one — the reveal is hers). `generating` respects reduced motion as a static line (04 §6.1).
import { useEffect, useState } from "react";
import { FUNNEL_OPTIONS } from "../../lib/funnel-options";
import { FIELD_STYLES } from "./field-styles";

const SEARCH_MS = 1200;

export function ReviewStep({
  area,
  summary,
  defaultBio,
}: {
  readonly area: string;
  readonly summary: ReadonlyArray<readonly [label: string, value: string]>;
  readonly defaultBio?: string;
}) {
  const [searching, setSearching] = useState(true);
  useEffect(() => {
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timer = setTimeout(
      () => setSearching(false),
      reduced ? 0 : SEARCH_MS,
    );
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="space-y-6">
      <p
        aria-busy={searching}
        aria-live="polite"
        className="text-sm text-slate-600"
      >
        {searching
          ? `Looking at families near ${area}…`
          : `Families near ${area} are looking for someone like you.`}
      </p>
      <dl className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
        {summary.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">
              {label}
            </dt>
            <dd className="text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <label htmlFor="bio" className={FIELD_STYLES.label}>
          About you — what a family should know
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={6}
          minLength={FUNNEL_OPTIONS.bioMinLength}
          defaultValue={defaultBio}
          required
          className={FIELD_STYLES.input}
        />
        <p className={FIELD_STYLES.hint}>
          A few sentences in your own words. You can change this any time from
          your profile.
        </p>
      </div>
    </div>
  );
}
