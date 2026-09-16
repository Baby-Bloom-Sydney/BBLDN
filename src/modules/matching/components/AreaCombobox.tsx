"use client";
// The area picker (04 §6.1 S-X-05 shape, reused on S-X-01 / S-X-03 / S-X-06 / S-P-16): an ARIA 1.2 combobox over
// the areas table through `GET /api/areas`, with a polite results count (fix: a11y-12). London = area name +
// postcode district (ADR-101): the chosen area is written into two hidden fields, `area` and `district`, so a
// plain GET form carries it and `parseQuickMatchQuery` reads it back unchanged. Full postcodes are never asked
// for (03 §6.3 rule 1) — the search is on the name or the outward code.
import { useEffect, useId, useRef, useState } from "react";
import { formatAreaLabel } from "@/modules/areas";
import type { AreaRef } from "@/modules/scoring";
import { FUNNEL_PATHS } from "../lib/funnel-paths";

type Option = { readonly name: string; readonly district: string };

export type AreaComboboxProps = {
  readonly label?: string;
  readonly defaultValue?: AreaRef | null;
  readonly onChange?: (area: AreaRef | null) => void;
  readonly required?: boolean;
  readonly autoFocus?: boolean;
};

const MIN_QUERY = 2;
const DEBOUNCE_MS = 150;

const labelOf = (option: Option): string => formatAreaLabel(option);

async function searchAreas(query: string): Promise<ReadonlyArray<Option>> {
  const response = await fetch(
    `${FUNNEL_PATHS.areasApi}?q=${encodeURIComponent(query)}`,
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as { data?: unknown };
  return Array.isArray(body.data)
    ? body.data.filter(
        (entry): entry is Option =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Option).name === "string" &&
          typeof (entry as Option).district === "string",
      )
    : [];
}

export function AreaCombobox({
  label = "Your area",
  defaultValue,
  onChange,
  required,
  autoFocus,
}: AreaComboboxProps) {
  const id = useId();
  const [text, setText] = useState(
    defaultValue
      ? formatAreaLabel({
          name: defaultValue.area,
          district: defaultValue.district,
        })
      : "",
  );
  const [chosen, setChosen] = useState<AreaRef | null>(defaultValue ?? null);
  const [options, setOptions] = useState<ReadonlyArray<Option>>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const choose = (option: Option | null): void => {
    const next =
      option === null ? null : { area: option.name, district: option.district };
    setChosen(next);
    if (option !== null) setText(labelOf(option));
    setOpen(false);
    setActive(-1);
    onChange?.(next);
  };

  const onInput = (value: string): void => {
    setText(value);
    setChosen(null);
    onChange?.(null);
    if (timer.current !== null) clearTimeout(timer.current);
    if (value.trim().length < MIN_QUERY) {
      setOptions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => {
      searchAreas(value.trim())
        .then((found) => {
          setFailed(false);
          setOptions(found);
          setOpen(true);
          setActive(found.length > 0 ? 0 : -1);
        })
        .catch(() => {
          setFailed(true);
          setOptions([]);
        });
    }, DEBOUNCE_MS);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (current + 1) % options.length);
    } else if (event.key === "ArrowUp" && options.length > 0) {
      event.preventDefault();
      setActive((current) => (current <= 0 ? options.length - 1 : current - 1));
    } else if (event.key === "Enter" && open && active >= 0) {
      event.preventDefault();
      choose(options[active] ?? null);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const listId = `${id}-listbox`;
  const statusId = `${id}-status`;
  const count = open ? options.length : 0;

  return (
    <div className="relative">
      <label
        htmlFor={`${id}-input`}
        className="text-sm font-medium text-slate-900"
      >
        {label}
      </label>
      <input
        id={`${id}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        autoFocus={autoFocus}
        required={required}
        value={text}
        placeholder="e.g. Clapham or SW4"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active >= 0 ? `${id}-option-${active}` : undefined
        }
        aria-describedby={statusId}
        onChange={(event) => onInput(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      />
      <input type="hidden" name="area" value={chosen?.area ?? ""} />
      <input type="hidden" name="district" value={chosen?.district ?? ""} />
      <ul
        id={listId}
        role="listbox"
        aria-label="Areas"
        hidden={!open}
        className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
      >
        {options.map((option, index) => (
          <li
            key={`${option.district}-${option.name}`}
            id={`${id}-option-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={(event) => {
              event.preventDefault();
              choose(option);
            }}
            className={`cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-violet-50 text-violet-800" : "text-slate-700"}`}
          >
            {labelOf(option)}
          </li>
        ))}
      </ul>
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {failed
          ? "Areas could not be loaded. Try again."
          : open
            ? `${count} ${count === 1 ? "area" : "areas"} found`
            : chosen !== null
              ? `${formatAreaLabel({ name: chosen.area, district: chosen.district })} chosen`
              : ""}
      </p>
    </div>
  );
}
