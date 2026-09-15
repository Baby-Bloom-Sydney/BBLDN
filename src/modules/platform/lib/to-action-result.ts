// 01 §4a / §4e — the server-action half: a `Result` that React can serialise (`cause` stripped, INTERNAL
// reduced to the generic message). Actions return this, never a raw `Result` with a `cause`.
import type { AppErrorDetails, Result } from "@/modules/shared-types";
import type { ClientResult } from "../types";
import { toClientError } from "./to-client-error";

export function toActionResult<T, D extends AppErrorDetails = AppErrorDetails>(
  result: Result<T, D>,
): ClientResult<T, D> {
  return result.ok
    ? Object.freeze({ ok: true as const, value: result.value })
    : Object.freeze({ ok: false as const, error: toClientError(result.error) });
}
