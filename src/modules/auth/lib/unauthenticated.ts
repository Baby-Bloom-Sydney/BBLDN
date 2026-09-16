// 03 §1.4 — the one `UNAUTHENTICATED` error. The message is generic on purpose: a provider's text (`Invalid login
// credentials`, `User already registered`) both leaks implementation detail and enumerates accounts (07 §4).
import { err } from "@/modules/platform";
import type { AppError } from "@/modules/shared-types";
import type { AuthErrorDetails } from "../types";

const MESSAGE = "Please sign in to continue.";

export const unauthenticated = (
  cause?: unknown,
): {
  readonly ok: false;
  readonly error: AppError<AuthErrorDetails>;
} => err<AuthErrorDetails>("UNAUTHENTICATED", MESSAGE, undefined, cause);
