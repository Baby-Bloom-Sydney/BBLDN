// comms/email — the email half of the send seam (03 §8.1). The `EmailProvider` type itself lives in the
// parent's `types.ts` so a caller never reaches into a sub-module for it; this file names only what is
// email-only.
import type { EmailProvider, RenderedEmail } from "../types";

/** 03 §8.1 bindings for `EMAIL_PROVIDER`; `resend` is Phase 1 and is not installed by this unit. */
export type EmailProviderId = "resend" | "stub-email";

/** `stub-email` records what it was asked to send and delivers nothing (03 §8.4; 05 §3 rule 1). */
export type RecordingEmailProvider = EmailProvider & {
  readonly sent: ReadonlyArray<RenderedEmail>;
  reset(): void;
};
