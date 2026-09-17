// `SaveLeadInput` → a `parent_leads` row (02 §4.7): the answers are the `form_data` jsonb (with the completion
// flag beside them), `district` / `area` the resolved area's columns; `converted_*` and `position_id` are 1c's.
//
// **This is where a captured email is folded (ADR-146 (2)).** `parent_leads.email` is `citext`, so the
// comparison ADR-145 (2) rests on is the column's own property whatever case is stored; the fold is for the
// stored value — one spelling per family in the operator's worklist, and a reader that is not `citext`-aware
// still compares like with like. Blank is the same as absent: a lead either carries an address or it does not,
// and an empty string would make "carries one" a question with three answers.
import type { Database, Json } from "@/modules/shared-types";
import type { SaveLeadInput } from "../types";
import { LEAD_COMPLETED_KEY } from "./lead-completed-key";

export type ParentLeadInsert =
  Database["public"]["Tables"]["parent_leads"]["Insert"];

export function toLeadRow(input: SaveLeadInput): ParentLeadInsert {
  const formData: Record<string, Json> = {
    ...(input.answers as Record<string, Json>),
    [LEAD_COMPLETED_KEY]: input.completed,
  };
  const email = (input.email ?? "").trim().toLowerCase();
  return {
    id: input.id,
    form_data: formData,
    district: input.answers.area?.district ?? null,
    area: input.answers.area?.area ?? null,
    email: email === "" ? null : email,
    source: input.source,
  };
}
