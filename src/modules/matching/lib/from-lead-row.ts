// A `parent_leads` row → `ParentLead`, or `null` when `form_data` cannot be read as answers — never a
// half-parsed lead (01 §4a: validated at the boundary, on the way back in as well).
import type { Database, Json, LeadId } from "@/modules/shared-types";
import type { ParentLead } from "../types";
import { LEAD_COMPLETED_KEY } from "./lead-completed-key";
import { parseWizardAnswers } from "./wizard-answers-schema";

export type ParentLeadRow = Database["public"]["Tables"]["parent_leads"]["Row"];

export function fromLeadRow(row: ParentLeadRow): ParentLead | null {
  if (typeof row.form_data !== "object" || row.form_data === null) return null;
  const { [LEAD_COMPLETED_KEY]: completed, ...rest } = row.form_data as Record<
    string,
    Json
  >;
  const answers = parseWizardAnswers(rest);
  if (answers === null) return null;
  return Object.freeze({
    id: row.id as LeadId,
    answers,
    area:
      row.district === null
        ? null
        : { area: row.area ?? row.district, district: row.district },
    source: row.source,
    completed: completed === true,
  });
}
