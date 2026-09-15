// 01 §4a table, HTTP column — the one ErrorCode → status mapping (shared-types owns the codes, platform the map).
import type { ErrorCode } from "@/modules/shared-types";
import type { ErrorStatus } from "../types";

const STATUS_BY_CODE: Readonly<Record<ErrorCode, ErrorStatus>> = Object.freeze({
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  INTERNAL: 500,
});

export const statusForCode = (code: ErrorCode): ErrorStatus =>
  STATUS_BY_CODE[code];
