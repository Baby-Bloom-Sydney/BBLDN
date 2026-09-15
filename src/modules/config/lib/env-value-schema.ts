// One zod value schema per registry entry (01 §3.3): booleans are the literal "true"; numbers are parsed, never
// coerced silently; enums are closed; blank strings count as unset.
import { z } from "zod";
import type { EnvEntry } from "../types";

const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const numberFromString = z.string().transform((value, ctx) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: "custom", message: "not a finite number" });
    return z.NEVER;
  }
  return parsed;
});

function baseSchema(entry: EnvEntry): z.ZodType<unknown> {
  switch (entry.kind) {
    case "boolean":
      return z.string().transform((value) => value === "true");
    case "number":
      return numberFromString;
    case "enum":
      return z.enum(entry.values as [string, ...string[]]);
    case "url":
      return z.url();
    case "uuid":
      return z.uuid();
    case "email":
      return z.email();
    case "string":
      return z.string().min(1);
  }
}

export function envValueSchema(
  entry: EnvEntry,
  required: boolean,
): z.ZodType<unknown> {
  const schema = baseSchema(entry);
  return z.preprocess(blankToUndefined, required ? schema : schema.optional());
}
