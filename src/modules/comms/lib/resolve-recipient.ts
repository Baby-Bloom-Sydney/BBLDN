// ADR-136 — a `Recipient` becomes a `ResolvedRecipient`, inside the send and nowhere else.
//
// `{ email }` is already an address and only its shape is checked. `{ userId }` is looked up in the module's own
// store (`user_profiles`, keyed, service scope) — the one read 01 §2.4 puts here rather than in the calling
// module, because `comms` is the owner of sends and the caller must not be able to obtain an address.
//
// Both failures answer **`invalid-recipient`**, on purpose: "there is no such user", "that user has no address"
// and "that address is malformed" must not be distinguishable from outside, or the send becomes an enumeration
// oracle over user ids (07 §4, the property ADR-132 protects on the sign-in form).
import { err, ok } from "@/modules/platform";
import type { Result } from "@/modules/shared-types";
import type {
  CommsErrorDetails,
  CommsStore,
  Recipient,
  ResolvedRecipient,
} from "../types";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const refuse = (): Result<never, CommsErrorDetails> =>
  err("VALIDATION", "A valid email address is required", {
    reason: "invalid-recipient",
  });

export async function resolveRecipient(
  store: CommsStore,
  to: Recipient,
): Promise<Result<ResolvedRecipient, CommsErrorDetails>> {
  if ("email" in to) {
    return EMAIL_SHAPE.test(to.email) ? ok(to) : refuse();
  }
  const resolved = await store.resolveRecipient(to.userId);
  if (!resolved.ok) return resolved;
  if (!EMAIL_SHAPE.test(resolved.value.email)) return refuse();
  // The caller's `name` is a display preference, not an identity: the store's own is the one the person set.
  return ok({
    ...resolved.value,
    userId: to.userId,
    ...(resolved.value.name === undefined && to.name !== undefined
      ? { name: to.name }
      : {}),
  });
}
