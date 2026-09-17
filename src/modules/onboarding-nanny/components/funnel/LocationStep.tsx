"use client";
// N1 Location (04 §4.1 row 2): "Where in London are you?" — area + district over the areas table. Outside
// Greater London is a plain stop (T-4.1): the visitor who cannot find her area says so and gets the stop screen.
import { useState } from "react";
import { DistrictCombobox } from "./DistrictCombobox";
import { FIELD_STYLES } from "./field-styles";

export function LocationStep({
  areasApi,
  defaultValue,
  onOutsideLondon,
}: {
  readonly areasApi: string;
  readonly defaultValue?: { readonly name: string; readonly district: string } | null;
  readonly onOutsideLondon: () => void;
}) {
  const [chosen, setChosen] = useState(defaultValue !== undefined && defaultValue !== null);
  return (
    <div className="space-y-4">
      <DistrictCombobox
        areasApi={areasApi}
        defaultValue={defaultValue ?? null}
        onChange={(area) => setChosen(area !== null)}
        invalid={!chosen ? undefined : false}
      />
      <p className={FIELD_STYLES.hint}>Start typing your area or the first part of your postcode.</p>
      <button type="button" onClick={onOutsideLondon} className={FIELD_STYLES.link}>
        My area isn&rsquo;t listed
      </button>
    </div>
  );
}
