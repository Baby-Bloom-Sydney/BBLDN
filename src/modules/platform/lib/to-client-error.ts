// 01 §4a — what crosses the boundary: `cause` stripped; an INTERNAL error is reduced to its code and the
// generic message (its details may name a table, a query or a provider — server-side only).
import type {
  AppError,
  AppErrorDetails,
  ClientAppError,
} from "@/modules/shared-types";

const INTERNAL_MESSAGE = "Something went wrong on our side. Please try again.";

export function toClientError<D extends AppErrorDetails>(
  error: AppError<D>,
): ClientAppError<D> {
  if (error.code === "INTERNAL") {
    return Object.freeze({ code: error.code, message: INTERNAL_MESSAGE });
  }
  const { code, message, details } = error;
  return Object.freeze({
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });
}
