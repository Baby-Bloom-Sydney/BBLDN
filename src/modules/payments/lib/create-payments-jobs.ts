// The five money jobs (01 §4f; 02 §4.5 "jobs"), the only file in the group that does I/O. It reads the spine
// once per run, asks `sweep-targets.ts` which rows this job acts on, writes the patch where there is one, and
// emits per row. Three things are deliberate:
//
//   1. **One read per run, not one per row.** `listSpine` is the whole table under the service role; at launch
//      scale that is a small read once a day. It is the one whole-table read left in this module.
//   2. **A row that fails does not stop the sweep.** A cron that aborts on the first bad row leaves the rest of
//      the cohort unswept and tells no one which; each row is counted `handled` or `skipped` and the run
//      summary is the truth (01 §4f). A store failure on the *read* does fail the run — there is nothing to do.
//   3. **`payment-due-sweep` writes nothing ON THE SPINE** (02 §4.5 writers table). It emits `payment.due` and
//      raises the operator's row, and that is all — no link is minted and no column on the row is touched.
//      ★ The row is new (ADR-160, and REVIEW-4 §6.5's pin 2, whose stated owner had landed): AC-A-41 asks for
//      one open `admin_notifications.payment_due` per family, and until ADR-160 no module owned that table, so
//      the claim was pinned rather than faked. `comms.notifyAdmin()` is now its one writer, `payments` already
//      holds `comms`, and ADR-160 names this caller in writing. The insert is idempotent on
//      `admin_notifications_one_open_per_subject_idx`, which is what keeps the sweep free to re-run.
import { PRICES } from "@/modules/config";
import type { Actor, FamilyId, Instant, Uuid } from "@/modules/shared-types";
import type { PaymentJobName, PaymentJobRun, PaymentsJobs } from "../types";
import { carryStoreError } from "./carry-store-error";
import type { PaymentsDeps } from "./deps";
import { emitMoneyEvents } from "./emit-money-events";
import { sendTrialReminder } from "./send-trial-reminder";
import { sweepTargets } from "./sweep-targets";
import type { SweepTarget } from "./sweep-targets";
import type { SpineRow } from "./spine-store";

/** The cron is the actor, and it is the job's own name — `SYSTEM_JOB_NAMES` carries all five, so the event log
 * says which sweep lapsed a family rather than "a system". */
const actorFor = (job: PaymentJobName): Actor => ({ kind: "system", id: job });

const familyOf = (row: SpineRow): FamilyId => row.parent_user_id as FamilyId;

/** A lapse row: write `lapsed`, then say so. The event is the trail; the row is the truth. */
async function lapseOne(
  deps: PaymentsDeps,
  target: SweepTarget,
  actor: Actor,
): Promise<boolean> {
  const written = await deps.store.updateSpine(
    target.row.id as Uuid,
    target.patch ?? {},
  );
  if (!written.ok) return false;
  await emitMoneyEvents(deps.events, {
    names: ["access.lapsed"],
    familyId: familyOf(target.row),
    actor,
    props: {
      path:
        target.row.purchase_path === "self_serve"
          ? "self-serve"
          : "payment-link",
      reason: target.lapseReason ?? "access-ended",
    },
  });
  return true;
}

/** T-5. The stamp is written **before** the send is judged, so a provider outage cannot re-send tomorrow. */
async function remindOne(
  deps: PaymentsDeps,
  target: SweepTarget,
): Promise<boolean> {
  const written = await deps.store.updateSpine(
    target.row.id as Uuid,
    target.patch ?? {},
  );
  if (!written.ok) return false;
  const familyId = familyOf(target.row);
  const contact = await deps.store.familyContact(familyId);
  await sendTrialReminder(
    deps.comms,
    familyId,
    contact.ok ? contact.value : null,
    (written.value.trial_ends_at ?? target.row.updated_at) as Instant,
  );
  return true;
}

/** ADR-094 — flag it, never mint a link, never charge. One `payment.due` per family per run. */
async function flagOne(
  deps: PaymentsDeps,
  target: SweepTarget,
  actor: Actor,
): Promise<boolean> {
  const family = familyOf(target.row);
  // ADR-160: the email is the delivery, the row the state — and the state is the half that must survive. It is
  // raised BEFORE the event so a run that dies between them has told the operator rather than only the log; a
  // repeat run answers the open row rather than duplicating it (the one-open-per-subject index).
  const notified = await deps.comms.notifyAdmin({
    kind: "payment_due",
    subject: { type: "family", id: family as string as Uuid },
    summary: "A placement balance is due and no payment link has been sent.",
    ...(target.row.payment_due_at === null
      ? {}
      : { dueAt: target.row.payment_due_at as never }),
  });
  if (!notified.ok) return false;
  const emitted = await emitMoneyEvents(deps.events, {
    names: ["payment.due"],
    familyId: family,
    actor,
    props: {
      path: "payment-link",
      reason: "balance-after-week-1",
      ...(target.row.placement_id === null
        ? {}
        : { placementId: target.row.placement_id }),
      ...(target.row.balance_pence === null
        ? {}
        : { amountMinor: target.row.balance_pence }),
      ...(target.row.payment_due_at === null
        ? {}
        : { paymentDueAt: target.row.payment_due_at }),
    },
  });
  return emitted.length > 0;
}

export function createPaymentsJobs(deps: PaymentsDeps): PaymentsJobs {
  const jobs: PaymentsJobs = {
    run: async (job, now) => {
      const rows = await deps.store.listSpine();
      if (!rows.ok) return carryStoreError(rows.error);
      const targets = sweepTargets(
        job,
        rows.value,
        now,
        PRICES.trialReminderDaysBefore,
      );
      let handled = 0;
      for (const target of targets) {
        const done =
          job === "trial-reminders"
            ? await remindOne(deps, target)
            : job === "payment-due-sweep"
              ? await flagOne(deps, target, actorFor(job))
              : await lapseOne(deps, target, actorFor(job));
        if (done) handled += 1;
      }
      const run: PaymentJobRun = {
        job,
        handled,
        skipped: targets.length - handled,
      };
      return { ok: true, value: Object.freeze(run) };
    },
  };
  return Object.freeze(jobs);
}
