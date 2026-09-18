// Cron shell for `/api/cron/audit-consent-expiry` (01 §4e / §4f; FATE `10.18` / `10.19` / `07.72` / `08.34`).
// Thin by rule: `runCron` is the one place the Bearer `CRON_SECRET` check lives, and this file supplies the
// inside. Since L-009 `3g` the inside is **two** passes, and they are two because they audit different things:
//
//   1. `consent.auditExpiry` — the **documents**. A day-one slug with no version at all is an outage
//      (`ALERT_CONSENT_DOCUMENT_MISSING`); a passed re-acceptance deadline is a promise nobody kept. (`3c`)
//   2. `consent.sweepRenewals` — the **people**. Whose newest signature for a purpose predates the annual
//      cadence, and for each: carried forward with the carry recorded, or owed a re-ask. (`3g`)
//
// They share one cron rather than taking a second because they are the same question asked of the two sides of
// one consent — and because 01 §4f owns the schedule: a new entry is a new declaration, a new `SystemJobName`
// and a new thing to forget, for a job that has to run at the same cadence as the one already here.
//
// **The run summary joins them honestly.** `handled` is work completed — documents audited plus carries written.
// `skipped` is work **outstanding** — a missing document, plus every subject × purpose whose words have moved
// and whom nobody has re-asked. The second number is the one an operator acts on, and it is why the two passes
// share a line rather than one of them logging quietly: a cron reporting only what it managed to do would show
// a clean run on the day a thousand people became due.
import { consent, log } from "@/modules/platform";
import { runCron } from "@/app/api/_lib/run-cron";

export const dynamic = "force-dynamic";

const PATH = "/api/cron/audit-consent-expiry";

export async function GET(request: Request): Promise<Response> {
  return runCron(request, PATH, async (now) => {
    const documents = await consent.auditExpiry(now);
    if (!documents.ok) return documents;

    const people = await consent.sweepRenewals(now);
    if (!people.ok) return people;

    // The breakdown, because `handled` / `skipped` alone cannot tell "nobody was due" from "everybody was due
    // and none of them was carried". Counts only — no user id and no purpose she holds (01 §4b).
    log.info("consent renewal sweep", {
      action: "audit-consent-expiry",
      checked: people.value.checked,
      carried: people.value.carried,
      reAsk: people.value.reAsk,
      unavailable: people.value.unavailable,
    });

    return {
      ok: true,
      value: Object.freeze({
        handled: documents.value.handled + people.value.carried,
        skipped:
          documents.value.skipped +
          people.value.reAsk +
          people.value.unavailable,
      }),
    };
  });
}
