// The boot slot for `placement-start-sweep`. Fails closed until `configurePlacementsJobs` installs the inside:
// a sweep that answered "nothing was due" from nowhere reads on the run-summary line exactly like a quiet
// night, and a cron that has silently stopped working is what 01 §4f's log line exists to make visible.
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { PlacementsJobs } from "../types";

const unconfigured: PlacementsJobs = Object.freeze({
  runStartSweep: async () =>
    err("INTERNAL", "Placements jobs are not configured", {
      reason: "placements-not-configured" as const,
    }),
});

export const PLACEMENTS_JOBS_REGISTRY: Registry<PlacementsJobs> =
  createRegistry<PlacementsJobs>(unconfigured);
