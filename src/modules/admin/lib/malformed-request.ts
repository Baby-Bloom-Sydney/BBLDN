// The one refusal every admin action gives a malformed body. `VALIDATION`, not `FORBIDDEN`: nothing has been
// decided about the caller yet, and saying otherwise would make a typo look like an access denial in the logs
// an incident is read from.
import { err } from "@/modules/platform";

export function malformedRequest() {
  return err("VALIDATION", "That request was not understood.", {
    reason: "E_MALFORMED_REQUEST" as const,
  });
}
