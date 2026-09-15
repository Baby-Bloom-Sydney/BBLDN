// 01 §4c — the envelope, framework-free: `{ data, meta?, requestId }` or `{ error, requestId }`, the status from
// the §4a table (or the caller's 200 / 201 / 204), `x-request-id` on every response, `Retry-After` on 429
// (rule 5) when the limiter said how long.
import type { AppError, AppErrorDetails, Result } from "@/modules/shared-types";
import type { EnvelopeOptions, EnvelopePayload } from "../types";
import { statusForCode } from "./status-for-code";
import { toClientError } from "./to-client-error";

const REQUEST_ID_HEADER = "x-request-id";
const RETRY_AFTER_HEADER = "Retry-After";
const NO_CONTENT = 204;

// Reads the *raw* error, not the `toClientError` copy, and must: the header needs the true number of seconds,
// which a redaction could only ever damage. Numbers in `details` are checked by `safeDetails` for the body only.
function retryAfter(
  error: AppError<AppErrorDetails>,
): Readonly<Record<string, string>> {
  if (error.code !== "RATE_LIMITED") return {};
  const seconds = error.details?.retryAfterSeconds;
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? { [RETRY_AFTER_HEADER]: String(Math.max(0, Math.ceil(seconds))) }
    : {};
}

export function envelopeOf<T, D extends AppErrorDetails = AppErrorDetails>(
  result: Result<T, D>,
  options: EnvelopeOptions,
): EnvelopePayload<T, D> {
  const requestId = options.requestId;
  const baseHeaders = { [REQUEST_ID_HEADER]: requestId };
  if (!result.ok) {
    return Object.freeze({
      status: statusForCode(result.error.code),
      body: { error: toClientError(result.error), requestId },
      headers: Object.freeze({ ...baseHeaders, ...retryAfter(result.error) }),
    });
  }
  const status = options.status ?? 200;
  if (status === NO_CONTENT) {
    return Object.freeze({
      status,
      body: null,
      headers: Object.freeze(baseHeaders),
    });
  }
  return Object.freeze({
    status,
    body: {
      data: result.value,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
      requestId,
    },
    headers: Object.freeze(baseHeaders),
  });
}
