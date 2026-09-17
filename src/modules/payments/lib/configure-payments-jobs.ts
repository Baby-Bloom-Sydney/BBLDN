// Boot hook for the jobs binding. Separate from `configurePayments` because the two have different lifetimes: a
// job runs under the service role on a cron's schedule, a purchase method under a session on a request.
import type { PaymentsJobs } from "../types";
import { PAYMENTS_JOBS_REGISTRY } from "./payments-jobs-registry";

export function configurePaymentsJobs(jobs: PaymentsJobs): void {
  PAYMENTS_JOBS_REGISTRY.set(jobs);
}
