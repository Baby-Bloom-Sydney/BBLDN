"use client";
// 04 §6.3 S-N-05 — "each file input labelled (formats, max size); per file `selecting · uploading`; `aria-describedby`
// + `aria-invalid`" (fix: a11y-5 / a11y-6). The accepted list and the cap are props from config; the chosen
// file's name and size are read back so she knows what she picked before she sends it.
import { useId, useState } from "react";
import { FIELD_STYLES } from "./field-styles";

const MEGABYTE = 1024 * 1024;

export function FileField({
  name,
  label,
  hint,
  acceptedMimes,
  maxBytes,
  capture,
  invalid,
}: {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly acceptedMimes: ReadonlyArray<string>;
  readonly maxBytes: number;
  readonly capture?: "user" | "environment";
  readonly invalid?: boolean;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<{ name: string; bytes: number } | null>(
    null,
  );
  const formats = acceptedMimes
    .map((mime) =>
      mime
        .replace(/^image\//, "")
        .replace("application/", "")
        .toUpperCase(),
    )
    .join(", ");
  return (
    <div>
      <label htmlFor={`${id}-input`} className={FIELD_STYLES.label}>
        {label}
      </label>
      <input
        id={`${id}-input`}
        name={name}
        type="file"
        accept={acceptedMimes.join(",")}
        {...(capture === undefined ? {} : { capture })}
        aria-describedby={`${id}-hint ${id}-status`}
        aria-invalid={invalid === true ? true : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          setChosen(
            file === undefined ? null : { name: file.name, bytes: file.size },
          );
        }}
        className={FIELD_STYLES.file}
      />
      <p id={`${id}-hint`} className={FIELD_STYLES.hint}>
        {hint ? `${hint} ` : ""}
        {formats}, up to {Math.round(maxBytes / MEGABYTE)} MB.
      </p>
      <p
        id={`${id}-status`}
        role="status"
        aria-live="polite"
        className={FIELD_STYLES.hint}
      >
        {chosen === null
          ? ""
          : `${chosen.name} chosen (${(chosen.bytes / MEGABYTE).toFixed(1)} MB)`}
      </p>
    </div>
  );
}
