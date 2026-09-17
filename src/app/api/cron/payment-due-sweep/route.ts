// Cron shell for `/api/cron/payment-due-sweep` (01 §4e / §4f; ADR-094, AC-A-41). Thin by rule: `runCron` is the
// one place the Bearer `CRON_SECRET` check lives, and this file supplies the inside.
//
// The sweep **writes nothing on the spine row** (02 §4.5 writers table): it emits one `payment.due` per family
// whose nanny started a week ago with no payment link sent, and that is the whole job. It never mints a link and
// never charges — "don't pay until you're happy with your nanny" means the matchmaker sends the link by hand.
// Re-running it is therefore free: the same families are found until a link is sent.
//
// RECORDED GAP: AC-A-41 also asks for one open `admin_notifications.payment_due` per family. No module owns
// `admin_notifications` (01 §2.3 names no writer, and `payments` may not reach past `comms`), so the row is not
// written and the behaviour is pinned `it.fails` in `payments.jobs.test.ts` rather than faked. Owner: whoever
// gives `admin_notifications` a connector.
import { paymentsJobs } from "@/modules/payments";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/payment-due-sweep";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, async (now) => {
    const run = await paymentsJobs.run("payment-due-sweep", now);
    return run.ok
      ? {
          ok: true,
          value: { handled: run.value.handled, skipped: run.value.skipped },
        }
      : run;
  });
}
