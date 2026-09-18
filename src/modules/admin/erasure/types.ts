// The erasure panel's type surface (07 §6.1; 07 §5.4). Two actions, because the road is two steps on purpose:
// recording the request that arrived by email is not the same act as erasing somebody, and separating them is
// what lets the subject be **read off a row** on the step that destroys data (ADR-145; 07 §5.4 row 6).
import type {
  ClientResult,
  ErasureOutcome,
  ErasureRequest,
} from "@/modules/platform";

export type ErasureActionDetails = {
  readonly reason:
    | "not-permitted"
    | "invalid-input"
    | "subject-not-found"
    | "request-not-found"
    | "request-not-open"
    | "store-failed";
};

/** Step 1 — the admin types the address from the email. Erases nothing. */
export type OpenErasureRequestAction = (
  previous: unknown,
  formData: FormData,
) => Promise<ClientResult<ErasureRequest, ErasureActionDetails>>;

/** Step 2 — the admin confirms the row. The only argument is the request id. */
export type RunErasureRequestAction = (input: {
  readonly requestId?: unknown;
}) => Promise<ClientResult<ErasureOutcome, ErasureActionDetails>>;

export type ErasureRequestRow = {
  readonly requestId: string;
  readonly subjectUserId: string;
  readonly road: ErasureRequest["road"];
  readonly requestedAt: string;
};
