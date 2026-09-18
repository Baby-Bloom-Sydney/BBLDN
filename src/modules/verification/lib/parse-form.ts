// 01 §4a — one boundary parse for every action in the module: the named fields are lifted from the `FormData`
// (a `File` stays a `File`), the schema decides, and a refusal is a `VALIDATION` naming the first bad field so
// the summary can take focus on it (04 §6.1). Nothing else in an action touches `FormData`.
import { z } from "zod";
import { err, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { VerificationActionDetails } from "../types";

export function parseForm<S extends z.ZodTypeAny>(
  schema: S,
  formData: FormData,
  fields: ReadonlyArray<string>,
): Result<z.output<S>, VerificationActionDetails> {
  const raw = Object.fromEntries(
    fields.map((field) => [field, formData.get(field) ?? undefined]),
  );
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data as z.output<S>);
  const first = parsed.error.issues[0];
  return err<VerificationActionDetails>(
    "VALIDATION",
    first?.message ?? "Please check the details you entered.",
    { reason: "invalid-input", field: String(first?.path[0] ?? "") },
  );
}
