// 01 §4a — the one result shape. London has `ok` only (Sydney mixed `success:` and `ok:`).
import type { AppError } from "./app-error";

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AppError };
