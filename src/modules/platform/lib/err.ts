// 01 §4a — the failure half of `Result`. `details` closes a contract's reason union (03 §1 rule 4); `cause` is
// the server-side context and never crosses to a client (`toClientError`).
import type {
  AppError,
  AppErrorDetails,
  ErrorCode,
} from "@/modules/shared-types";

export function err<D extends AppErrorDetails = AppErrorDetails>(
  code: ErrorCode,
  message: string,
  details?: D,
  cause?: unknown,
): { readonly ok: false; readonly error: AppError<D> } {
  const error: AppError<D> = Object.freeze({
    code,
    message,
    ...(details === undefined ? {} : { details }),
    ...(cause === undefined ? {} : { cause }),
  });
  return Object.freeze({ ok: false as const, error });
}
