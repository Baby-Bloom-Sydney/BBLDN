// Cron shell for `/api/cron/audit-consent-expiry` (01 §4e / §4f; FATE `10.19` / `07.72` / `08.34`). Thin by rule:
// `runCron` is the one place the Bearer `CRON_SECRET` check lives, and this file supplies the inside —
// `consent.auditExpiry`: a day-one document with no version at all is an outage (`ALERT_CONSENT_DOCUMENT_MISSING`),
// a passed re-acceptance deadline is a promise nobody kept. Declared since Phase 0; handler-less until L-009 `3c`.
import { consent } from "@/modules/platform";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/audit-consent-expiry";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, (now) => consent.auditExpiry(now));
}
