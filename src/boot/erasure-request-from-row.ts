// One `account_erasure_requests` row → the connector's `ErasureRequest` (03 §1: no driver shape crosses a
// connector boundary). The narrowing of `road` and `state` happens here rather than being asserted: the CHECK
// constraints in `0028` are what make the values closed, and a row that somehow carried another value would
// land on the safe reading — `admin` (the road that needs a person) and `requested` (the state that keeps it
// open) — rather than being silently treated as done.
import type { ErasureRequest } from "@/modules/platform";
import type { Instant } from "@/modules/shared-types";

type RawRequest = {
  readonly id: string;
  readonly subject_user_id: string;
  readonly road: string;
  readonly state: string;
  readonly refusal_reason: string | null;
  readonly requested_at: string;
};

export function erasureRequestFromRow(row: RawRequest): ErasureRequest {
  return Object.freeze({
    requestId: row.id,
    subjectUserId: row.subject_user_id,
    road: row.road === "self-service" ? "self-service" : "admin",
    state:
      row.state === "completed"
        ? "completed"
        : row.state === "refused"
          ? "refused"
          : "requested",
    refusalReason: row.refusal_reason,
    requestedAt: row.requested_at as Instant,
  });
}
