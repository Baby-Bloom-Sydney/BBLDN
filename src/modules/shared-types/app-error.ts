// 01 §4a — the one error shape. `D` lets a contract close its `details.reason` union (03 §1 rule 4). `cause`
// never crosses to the client: the boundary returns `ClientAppError` (platform's envelope helper, S3).
import type { ERROR_CODES } from "./error-codes";

export type AppErrorDetails = Readonly<Record<string, unknown>>;

export type AppError<D extends AppErrorDetails = AppErrorDetails> = {
  readonly code: (typeof ERROR_CODES)[number];
  readonly message: string;
  readonly details?: D;
  readonly cause?: unknown;
};

export type ClientAppError<D extends AppErrorDetails = AppErrorDetails> = Omit<
  AppError<D>,
  "cause"
>;
