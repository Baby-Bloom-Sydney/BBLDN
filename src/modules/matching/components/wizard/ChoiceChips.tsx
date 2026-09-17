"use client";
// One group of choices as chips — radio semantics for a single answer, checkbox semantics for several. Native
// inputs under the hood, so keyboard and screen readers get the platform behaviour for nothing.
import { useId } from "react";

export type ChoiceChipsProps = {
  readonly legend: string;
  readonly options: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
  readonly value: ReadonlyArray<string>;
  readonly onChange: (next: ReadonlyArray<string>) => void;
  readonly multiple?: boolean;
  readonly legendHidden?: boolean;
};

const chip =
  "cursor-pointer select-none rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition-colors peer-checked:border-violet-500 peer-checked:bg-violet-50 peer-checked:text-violet-700 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2 hover:border-slate-300";

export function ChoiceChips({
  legend,
  options,
  value,
  onChange,
  multiple,
  legendHidden,
}: ChoiceChipsProps) {
  const id = useId();
  const toggle = (option: string, checked: boolean): void => {
    if (!multiple) return onChange([option]);
    onChange(
      checked ? [...value, option] : value.filter((entry) => entry !== option),
    );
  };
  return (
    <fieldset>
      <legend
        className={
          legendHidden ? "sr-only" : "text-sm font-medium text-slate-900"
        }
      >
        {legend}
      </legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const inputId = `${id}-${option.value}`;
          return (
            <div key={option.value}>
              <input
                id={inputId}
                type={multiple ? "checkbox" : "radio"}
                name={id}
                value={option.value}
                checked={value.includes(option.value)}
                onChange={(event) => toggle(option.value, event.target.checked)}
                className="peer sr-only"
              />
              <label htmlFor={inputId} className={chip}>
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
