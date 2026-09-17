// `insertEvent`'s idempotency gate reads the driver's unique-violation off the port's `INTERNAL` result: the port
// maps a thrown driver error to `INTERNAL` with the throw as `cause` (01 §4a rule 1; `platform.fromThrown`), and
// PostgREST reports Postgres 23505 as "duplicate key value violates unique constraint …". The constraint name is
// checked too, so a violation on a *different* unique index is never mistaken for a replayed event.
import type { AppError } from "@/modules/shared-types";

const DUPLICATE_KEY = /duplicate key value violates unique constraint/i;

export function isDuplicateKeyError(
  error: AppError,
  constraint: string,
): boolean {
  const cause = error.cause;
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "";
  return DUPLICATE_KEY.test(message) && message.includes(constraint);
}
