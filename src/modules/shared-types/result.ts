// 01 §4a — the one result shape. London has `ok` only (Sydney mixed `success:` and `ok:`).
import type { AppError, AppErrorDetails } from "./app-error";

export type Result<T, D extends AppErrorDetails = AppErrorDetails> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AppError<D> };
