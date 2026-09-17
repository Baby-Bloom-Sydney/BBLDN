// K-22 / K-24's `from` — "any live post-`ACCEPTED`", i.e. `LIVE_STAGES` minus the two a connection can only
// leave through L-2. A `CONFIRMED` or `ACTIVE` connection is a hire in progress; ending it is a placement fact,
// not a cancellation.
//
// It lives in its own file, and is exported from the module, because **`positions` needs it**: 03 §2.4's P-7
// cascades K-24 onto every live connection, and the caller has to know which stages will take that row rather
// than discover it from a refusal (H-12). Re-deriving the same filter at the call site would be the drift this
// file exists to prevent.
import type { ConnectionStage } from "@/modules/shared-types";
import { LIVE_STAGES } from "./live-stages";

export const CANCELLABLE_STAGES: ReadonlyArray<ConnectionStage> = Object.freeze(
  LIVE_STAGES.filter((stage) => stage !== "CONFIRMED" && stage !== "ACTIVE"),
);
