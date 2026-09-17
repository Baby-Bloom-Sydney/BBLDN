"use client";
// The area picker for the nanny surfaces (04 §6.1 S-X-15 / S-N-04 / S-N-18: "ARIA 1.2 combobox with a polite
// results count", fix: a11y-12): area name + postcode district over `GET /api/areas`, written into the two
// hidden fields `area` and `district`. The same shape as `matching`'s picker, which 01 §2.3 keeps out of reach
// of this module; the API path arrives as a prop (01 §2.5 — no config read in a component).
import { useEffect, useId, useRef, useState } from "react";
import { FIELD_STYLES } from "./field-styles";

type Option = { readonly name: string; readonly district: string };

const MIN_QUERY = 2;
const DEBOUNCE_MS = 150;
const labelOf = (option: Option): string => `${option.name}, ${option.district}`;

async function searchAreas(api: string, query: string): Promise<ReadonlyArray<Option>> {
  const response = await fetch(`${api}?q=${encodeURIComponent(query)}`, {
    headers: { accept: "application/json" },
  });
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

export function DistrictCombobox({
  areasApi,
  defaultValue,
  onChange,
  invalid,
}: {
  readonly areasApi: string;
  readonly defaultValue?: Option | null;
  readonly onChange?: (area: Option | null) => void;
  readonly invalid?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(defaultValue ? labelOf(defaultValue) : "");
  const [chosen, setChosen] = useState<Option | null>(defaultValue ?? null);
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
    setChosen(option);
    if (option !== null) setText(labelOf(option));
    setOpen(false);
    setActive(-1);
    onChange?.(option);
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
      searchAreas(areasApi, value.trim())
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
    } else if (event.key === "Escape") setOpen(false);
  };

  const listId = `${id}-listbox`;
  const statusId = `${id}-status`;
  const count = open ? options.length : 0;
  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className={FIELD_STYLES.label}>
        Your area
      </label>
      <input
        id={`${id}-input`}
        type="text"
        role="combobox"
        autoComplete="off"
        value={text}
        placeholder="e.g. Clapham or SW4"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid === true ? true : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        aria-describedby={statusId}
        onChange={(event) => onInput(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={FIELD_STYLES.input}
      />
      <input type="hidden" name="area" value={chosen?.name ?? ""} />
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
              ? `${labelOf(chosen)} chosen`
              : ""}
      </p>
    </div>
  );
}
