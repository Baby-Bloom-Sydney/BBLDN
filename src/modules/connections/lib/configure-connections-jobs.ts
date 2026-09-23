// Boot hook: installs the inside the three scheduled sweeps run through.
import type { ConnectionsJobs } from "../types";
import { CONNECTIONS_JOBS_REGISTRY } from "./connections-jobs-registry";

export function configureConnectionsJobs(jobs: ConnectionsJobs): void {
  CONNECTIONS_JOBS_REGISTRY.set(jobs);
}
