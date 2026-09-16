// 03 §1.4 — `FORBIDDEN { reason: 'role' | 'mfa' | 'scope' }`. One message; the reason is for the caller's routing
// and for logs, never rendered as an explanation of what the person is missing.
import { err } from "@/modules/platform";
import type { AppError } from "@/modules/shared-types";
import type { AuthErrorDetails, AuthFailureReason } from "../types";

const MESSAGE = "You do not have access to this.";

export const forbidden = (
  reason: AuthFailureReason,
): { readonly ok: false; readonly error: AppError<AuthErrorDetails> } =>
  err<AuthErrorDetails>("FORBIDDEN", MESSAGE, { reason });
