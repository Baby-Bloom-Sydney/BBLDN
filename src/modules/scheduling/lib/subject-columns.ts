// 03 §3.2 `Subject` → 02 §4.4 row 4's `subject_type` / `subject_id`. The column pair is deliberately not a
// foreign key ("one column cannot reference two tables" — `0009`'s own comment), so this is the only place the
// two shapes meet and the only place a position id and a nanny id can be confused. They cannot be: the tag
// picks the column value, and `Subject` has no third arm.
import type { Subject } from "@/modules/shared-types";

type SubjectColumns = {
  readonly subject_type: "position" | "nanny";
  readonly subject_id: string;
};

export function subjectColumns(subject: Subject): SubjectColumns {
  return subject.kind === "nanny"
    ? { subject_type: "nanny", subject_id: subject.nannyId }
    : { subject_type: "position", subject_id: subject.positionId };
}
