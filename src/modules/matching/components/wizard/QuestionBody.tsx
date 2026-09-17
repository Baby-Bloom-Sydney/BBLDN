"use client";
// Renders one question of the bank by its kind, reading and writing `WizardAnswers` (no question knows the
// others). The area question is the ARIA combobox over the areas table (04 §6.1).
import type { WizardQuestion } from "../../lib/wizard-questions";
import type { WizardAnswers } from "../../types";
import { AreaCombobox } from "../AreaCombobox";
import { ChildrenQuestion } from "./ChildrenQuestion";
import { ChoiceChips } from "./ChoiceChips";
import { DaysTimesQuestion } from "./DaysTimesQuestion";

export type QuestionBodyProps = {
  readonly question: WizardQuestion;
  readonly ageLabels: ReadonlyArray<string>;
  readonly answers: WizardAnswers;
  readonly onChange: (patch: Partial<WizardAnswers>) => void;
};

const YES_NO = Object.freeze([
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
]);

export function QuestionBody({
  question,
  ageLabels,
  answers,
  onChange,
}: QuestionBodyProps) {
  switch (question.kind) {
    case "children":
      return (
        <ChildrenQuestion
          ageLabels={ageLabels}
          value={answers.children ?? []}
          onChange={(children) => onChange({ children })}
        />
      );
    case "area":
      return (
        <AreaCombobox
          label="Area and postcode district"
          defaultValue={answers.area ?? null}
          onChange={(area) => onChange({ area: area ?? undefined })}
          autoFocus
        />
      );
    case "days-times":
      return (
        <DaysTimesQuestion
          days={answers.days ?? []}
          parts={answers.parts ?? []}
          onChange={(next) => onChange(next)}
        />
      );
    case "yes-no": {
      const current = answers[question.id as "drivingLicence"];
      return (
        <ChoiceChips
          legend={question.heading}
          legendHidden
          options={YES_NO}
          value={current === undefined ? [] : [current ? "yes" : "no"]}
          onChange={(next) => onChange({ [question.id]: next[0] === "yes" })}
        />
      );
    }
    case "multi":
      return (
        <ChoiceChips
          legend={question.heading}
          legendHidden
          options={question.options ?? []}
          value={
            (answers[question.id as "languages"] ?? []) as ReadonlyArray<string>
          }
          onChange={(next) => onChange({ [question.id]: next })}
          multiple
        />
      );
    case "single": {
      const raw = answers[question.id as "focus" | "minExperienceYears"];
      const current = raw === undefined ? [] : [String(raw)];
      return (
        <ChoiceChips
          legend={question.heading}
          legendHidden
          options={question.options ?? []}
          value={current}
          onChange={(next) =>
            onChange({
              [question.id]:
                question.id === "minExperienceYears"
                  ? Number.parseInt(next[0] ?? "0", 10)
                  : next[0],
            })
          }
        />
      );
    }
    default: {
      // ★ M-16 (REVIEW-2). `default:` used to re-narrow the discriminant with a cast and render `ChoiceChips`
      // with `options ?? []`, so a sixth `kind` compiled silently and reached a parent as a blank, unanswerable
      // question. This makes that addition a compile error — and, if one ever arrives at runtime from a version
      // skew, renders nothing rather than something broken.
      const exhaustive: never = question.kind;
      void exhaustive;
      return null;
    }
  }
}
