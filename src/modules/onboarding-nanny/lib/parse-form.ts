// 01 §4a — one boundary parse for every action in the module: the named fields are lifted from the `FormData`
// (repeated names become arrays), the schema decides, and a refusal is a `VALIDATION` naming the first bad field
// so the summary can take focus on it (04 §6.1). Nothing else in an action touches `FormData`.
import { z } from "zod";
import { err, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type { NannyFunnelErrorDetails } from "../types";

export function parseForm<S extends z.ZodTypeAny>(
  schema: S,
  formData: FormData,
  fields: ReadonlyArray<string>,
  arrays: ReadonlyArray<string> = [],
): Result<z.output<S>, NannyFunnelErrorDetails> {
  const raw = Object.fromEntries(
    fields.map((field) => [
      field,
      arrays.includes(field)
        ? formData.getAll(field).map(String)
        : (formData.get(field) ?? undefined),
    ]),
  );
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data as z.output<S>);
  const first = parsed.error.issues[0];
  return err<NannyFunnelErrorDetails>(
    "VALIDATION",
    first?.message ?? "Please check the details you entered.",
    { reason: "invalid-input", field: String(first?.path[0] ?? "") },
  );
}
