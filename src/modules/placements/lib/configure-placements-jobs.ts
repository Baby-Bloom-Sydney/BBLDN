// Boot hook: installs the inside `placement-start-sweep` runs through.
import type { PlacementsJobs } from "../types";
import { PLACEMENTS_JOBS_REGISTRY } from "./placements-jobs-registry";

export function configurePlacementsJobs(jobs: PlacementsJobs): void {
  PLACEMENTS_JOBS_REGISTRY.set(jobs);
}
