// One row of `children` as the module's own vocabulary (02 §4.6). Nothing the screens do not need crosses:
// `orphaned_at`, the soft lock and `status` are the module's and the jobs' business, and a screen that never
// receives them cannot render one by accident.
import type { ChildId, ISODate, Instant, UserId } from "@/modules/shared-types";
import type { ChildRow } from "./child-linking-store";
import type { ChildRecord } from "../types";

export const childRecordOf = (row: ChildRow): ChildRecord =>
  Object.freeze({
    id: row.id as ChildId,
    firstName: row.first_name,
    dateOfBirth: row.date_of_birth as ISODate,
    parentUserId: (row.parent_user_id as UserId | null) ?? null,
    createdAt: row.created_at as Instant,
  });
