// 01 §4a — the one error shape. `cause` is stripped before a Result crosses to the client.
import type { ERROR_CODES } from "./error-codes";

export type AppError = {
  readonly code: (typeof ERROR_CODES)[number];
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
};
