// 01 §4a rule 1 — a throw that reaches a wrapper becomes `INTERNAL` with the request id; the message a user
// sees never carries the stack or provider text. The throw itself rides as `cause` for the log line.
import type { AppError } from "@/modules/shared-types";
import type { ThrownContext } from "../types";
import { err } from "./err";

/** The one message an INTERNAL error shows (01 §4a "message is generic"). */
const INTERNAL_MESSAGE = "Something went wrong on our side. Please try again.";

export function fromThrown(
  thrown: unknown,
  context?: ThrownContext,
): { readonly ok: false; readonly error: AppError<ThrownContext> } {
  return err("INTERNAL", INTERNAL_MESSAGE, context, thrown);
}
