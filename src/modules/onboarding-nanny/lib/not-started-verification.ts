// What `verification.getStatus` means by "nothing yet" (I-V1), as a value the views can be handed.
//
// It is **not** a guess at a level: L0 is what the store answers for an account whose wizard has not been
// started, and `sync_nanny_verification_state()` is the only thing that ever writes another one. A read that
// **refused** lands here too, and deliberately — the screen then shows her the state of an account that has not
// started, with the "verify your details" action, which is the safe thing to say to someone whose real state we
// could not fetch. It never says she is verified, and it never says anything about a hold.
import type { VerificationState } from "@/modules/verification";
import type { UserId } from "@/modules/shared-types";

export const NOT_STARTED_VERIFICATION = (nannyId: UserId): VerificationState =>
  Object.freeze({
    nannyId,
    level: "L0_SIGNED_UP",
    suspended: false,
    sections: Object.freeze(
      (["contact", "identity", "dbs", "right-to-work"] as const).map(
        (section) => Object.freeze({ section, status: "not_started" as const }),
      ),
    ),
  });
