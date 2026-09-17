"use client";
// Days × parts, the same vocabulary as the front door (Mon = 0 — 02 §4.4 / ADR-118 (c); `scoring` parts).
import type { QuickMatchDay, QuickMatchPart } from "../../types";
import { ChoiceChips } from "./ChoiceChips";

export type DaysTimesQuestionProps = {
  readonly days: ReadonlyArray<QuickMatchDay>;
  readonly parts: ReadonlyArray<QuickMatchPart>;
  readonly onChange: (next: {
    readonly days: ReadonlyArray<QuickMatchDay>;
    readonly parts: ReadonlyArray<QuickMatchPart>;
  }) => void;
};

const DAYS = Object.freeze(
  [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ].map((label, value) => ({ value: String(value), label })),
);
const PARTS = Object.freeze([
  { value: "morning", label: "Morning · 6am – 10am" },
  { value: "midday", label: "Midday · 10am – 2pm" },
  { value: "afternoon", label: "Afternoon · 2pm – 6pm" },
  { value: "evening", label: "Evening · 6pm – 10pm" },
]);

const toDay = (value: string): QuickMatchDay =>
  Number.parseInt(value, 10) as QuickMatchDay;

export function DaysTimesQuestion({
  days,
  parts,
  onChange,
}: DaysTimesQuestionProps) {
  return (
    <div className="space-y-6">
      <ChoiceChips
        legend="Which days?"
        options={DAYS}
        value={days.map(String)}
        onChange={(next) => onChange({ days: next.map(toDay), parts })}
        multiple
      />
      <ChoiceChips
        legend="Which times?"
        options={PARTS}
        value={parts}
        onChange={(next) =>
          onChange({ days, parts: next as ReadonlyArray<QuickMatchPart> })
        }
        multiple
      />
    </div>
  );
}
