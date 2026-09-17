// The binding the cron shells import. Re-reads the registry on every call so boot wiring reaches every importer
// and a test can swap the inside between cases — the same shape as `default-payments.ts`.
import type { PaymentsJobs } from "../types";
import { PAYMENTS_JOBS_REGISTRY } from "./payments-jobs-registry";

const binding: PaymentsJobs = {
  run: (job, now) => PAYMENTS_JOBS_REGISTRY.get().run(job, now),
};

export const paymentsJobs: PaymentsJobs = Object.freeze(binding);
