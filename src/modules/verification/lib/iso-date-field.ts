// One date rule for the wizard's three date fields (S-N-05 date of birth, S-N-06 issue date, S-N-07 share-code
// DOB): `YYYY-MM-DD`, a real calendar date, and a bound the field names — never in the future for a document
// date, at least `minAge` years ago for a date of birth (a nanny is an adult).
import { z } from "zod";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const isRealDate = (value: string): boolean => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
};

const yearsAgo = (value: string): number =>
  (Date.now() - new Date(`${value}T00:00:00Z`).getTime()) / (DAY_MS * 365.25);

export function isoDateField(
  kind: { readonly minAge: number } | { readonly notFuture: true },
  label: string,
) {
  return z
    .string()
    .trim()
    .regex(ISO, `Enter the ${label} as YYYY-MM-DD.`)
    .refine(isRealDate, `Enter a real date for the ${label}.`)
    .refine(
      (value) =>
        "minAge" in kind
          ? yearsAgo(value) >= kind.minAge
          : yearsAgo(value) >= 0,
      "minAge" in kind
        ? `You need to be at least ${kind.minAge} to join.`
        : `The ${label} can't be in the future.`,
    );
}
