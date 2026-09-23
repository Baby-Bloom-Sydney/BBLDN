// The binding the cron shell calls. Re-reads the registry per call so boot wiring reaches every importer.
import type { PositionsJobs } from "../types";
import { POSITIONS_JOBS_REGISTRY } from "./positions-jobs-registry";

export const positionsJobs: PositionsJobs = Object.freeze({
  runCloseNoCandidates: (now) =>
    POSITIONS_JOBS_REGISTRY.get().runCloseNoCandidates(now),
});
