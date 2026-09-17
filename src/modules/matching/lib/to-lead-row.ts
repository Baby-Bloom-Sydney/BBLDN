// `SaveLeadInput` → a `parent_leads` row (02 §4.7): the answers are the `form_data` jsonb (with the completion
// flag beside them), `district` / `area` the resolved area's columns; `converted_*` and `position_id` are 1c's.
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
  return {
    id: input.id,
    form_data: formData,
    district: input.answers.area?.district ?? null,
    area: input.answers.area?.area ?? null,
    source: input.source,
  };
}
