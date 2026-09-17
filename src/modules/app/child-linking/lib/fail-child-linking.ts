// 03 §5.3's envelope rule applied to this module: every reason with the `ErrorCode` that is its status, in one
// place, so a reason can never travel under two codes. The message is a plain sentence a parent may read —
// **never the token**, never an id, never a Postgres exception verbatim (07 §8 row 7).
import { err } from "@/modules/platform";
import type { AppError, ErrorCode } from "@/modules/shared-types";
import type {
  ChildLinkingErrorDetails,
  ChildLinkingErrorReason,
} from "../types";

const CODE_FOR: Readonly<Record<ChildLinkingErrorReason, ErrorCode>> =
  Object.freeze({
    "child-linking-not-configured": "INTERNAL",
    E_CHILD_NOT_FOUND: "NOT_FOUND",
    E_ACTOR_FORBIDDEN: "FORBIDDEN",
    E_CHILD_TOO_OLD: "VALIDATION",
    E_INVITE_TOKEN_INVALID: "VALIDATION",
    E_INVITE_NOT_FOUND: "NOT_FOUND",
    E_INVITE_NOT_YOURS: "FORBIDDEN",
    E_INVITE_WRONG_ROLE: "FORBIDDEN",
    E_CHILD_ALREADY_CLAIMED: "CONFLICT",
    E_CHILD_ALREADY_LINKED: "CONFLICT",
    E_STORE: "INTERNAL",
  });

export function failChildLinking(
  reason: ChildLinkingErrorReason,
  message: string,
): { readonly ok: false; readonly error: AppError<ChildLinkingErrorDetails> } {
  return err(CODE_FOR[reason], message, { reason });
}
