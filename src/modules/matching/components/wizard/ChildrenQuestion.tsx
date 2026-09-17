"use client";
// The children question: up to three, each with an age from `MATCHING.ageRangeToMonths`' labels (03 §7.3).
import type { WizardChild } from "../../types";
import { ChoiceChips } from "./ChoiceChips";

export type ChildrenQuestionProps = {
  readonly ageLabels: ReadonlyArray<string>;
  readonly value: ReadonlyArray<WizardChild>;
  readonly onChange: (next: ReadonlyArray<WizardChild>) => void;
};

const MAX_CHILDREN = 3;
const COUNTS = Object.freeze(
  Array.from({ length: MAX_CHILDREN }, (_, index) => ({
    value: String(index + 1),
    label: String(index + 1),
  })),
);
const ORDINALS = ["first", "second", "third"] as const;

export function ChildrenQuestion({
  ageLabels,
  value,
  onChange,
}: ChildrenQuestionProps) {
  const count = value.length;
  const setCount = (next: number): void =>
    onChange(
      Array.from(
        { length: next },
        (_, index) => value[index] ?? { ageLabel: "" },
      ),
    );
  const setAge = (index: number, ageLabel: string): void =>
    onChange(value.map((child, at) => (at === index ? { ageLabel } : child)));
  const options = ageLabels.map((label) => ({ value: label, label }));
  return (
    <div className="space-y-6">
      <ChoiceChips
        legend="How many children?"
        options={COUNTS}
        value={count === 0 ? [] : [String(count)]}
        onChange={(next) => setCount(Number.parseInt(next[0] ?? "0", 10))}
      />
      {value.map((child, index) => (
        <ChoiceChips
          key={index}
          legend={`How old is your ${ORDINALS[index] ?? "next"} child?`}
          options={options}
          value={child.ageLabel === "" ? [] : [child.ageLabel]}
          onChange={(next) => setAge(index, next[0] ?? "")}
        />
      ))}
    </div>
  );
}
