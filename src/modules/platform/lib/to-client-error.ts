// 01 §4a — what crosses the boundary: `cause` stripped; an INTERNAL error is reduced to its code and the
// generic message (its details may name a table, a query or a provider — server-side only). Every other code
// keeps its `details`, but only after `safeDetails` has stripped anything that is an `Error` or reads as PII —
// the code stripping INTERNAL alone was the only guard, and it guarded exactly one of the eight codes.
import type {
  AppError,
  AppErrorDetails,
  ClientAppError,
} from "@/modules/shared-types";
import { safeDetails } from "./safe-details";

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
    ...(details === undefined ? {} : { details: safeDetails(details) }),
  });
}
