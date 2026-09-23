// The binding the cron shell calls. Re-reads the registry per call so boot wiring reaches every importer.
import type { PlacementsJobs } from "../types";
import { PLACEMENTS_JOBS_REGISTRY } from "./placements-jobs-registry";

export const placementsJobs: PlacementsJobs = Object.freeze({
  runStartSweep: (now) => PLACEMENTS_JOBS_REGISTRY.get().runStartSweep(now),
});
