// The boot slot for the module-level `paymentsJobs` binding, beside `payments`' own. **Fails closed**: until
// boot configures it, `run` answers `INTERNAL { reason: 'payments-not-configured' }` — so a cron shell that
// reaches an unwired job answers an error, never a 200 that reads as "the sweep ran and found nothing".
import { err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { PaymentsJobs } from "../types";

const unconfigured: PaymentsJobs = Object.freeze({
  run: async () =>
    err("INTERNAL", "Payments is not configured", {
      reason: "payments-not-configured" as const,
    }),
});

const slot = { current: unconfigured };

export const PAYMENTS_JOBS_REGISTRY: Registry<PaymentsJobs> = Object.freeze({
  get: () => slot.current,
  set: (next: PaymentsJobs) => {
    slot.current = next;
  },
});
