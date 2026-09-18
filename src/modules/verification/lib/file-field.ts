// A `File` as a server action receives it from `FormData` (the browser's `File`, or Node's), judged by shape so
// the check does not depend on which realm's `File` class is in scope. Emptiness is the only rule here; the
// type comes from the bytes later (07 §4.16).
import { z } from "zod";

const isFileLike = (value: unknown): value is File =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as File).arrayBuffer === "function" &&
  typeof (value as File).size === "number";

export function fileField(label: string) {
  return z
    .custom<File>(isFileLike, { message: `Choose a file for the ${label}.` })
    .refine((file) => file.size > 0, `Choose a file for the ${label}.`);
}
