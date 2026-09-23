// The boot slot for `close-no-candidates`. Fails closed until `configurePositionsJobs` installs the inside: a
// sweep that answered "nothing was due" from nowhere reads on the run-summary line exactly like a quiet night.
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { PositionsJobs } from "../types";

const unconfigured: PositionsJobs = Object.freeze({
  runCloseNoCandidates: async () =>
    err("INTERNAL", "Positions jobs are not configured", {
      reason: "positions-not-configured" as const,
    }),
});

export const POSITIONS_JOBS_REGISTRY: Registry<PositionsJobs> =
  createRegistry<PositionsJobs>(unconfigured);
