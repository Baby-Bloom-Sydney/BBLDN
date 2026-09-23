// Boot hook: installs the inside `close-no-candidates` runs through.
import type { PositionsJobs } from "../types";
import { POSITIONS_JOBS_REGISTRY } from "./positions-jobs-registry";

export function configurePositionsJobs(jobs: PositionsJobs): void {
  POSITIONS_JOBS_REGISTRY.set(jobs);
}
