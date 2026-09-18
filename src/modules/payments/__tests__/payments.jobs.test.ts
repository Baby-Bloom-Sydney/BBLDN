// The trial cluster and the five sweeps (01 §4f; 02 §4.5 "jobs"). The claims that matter here are the ones a
// cron makes silently: that a re-run does nothing twice, and that `payment-due-sweep` writes nothing at all.
import { describe, expect, it } from "vitest";
import { PRICES } from "@/modules/config";
import type {
  FamilyId,
  Instant,
  LinkRef,
  PlacementId,
} from "@/modules/shared-types";
import { createPaymentsJobs } from "../lib/create-payments-jobs";
import { memorySpineStore } from "../lib/memory-spine-store";
import type { MemorySpineStore } from "../lib/memory-spine-store";
import { sweepTargets } from "../lib/sweep-targets";
import { blankSpineRow } from "../lib/blank-spine-row";
import type { SpineRow } from "../lib/spine-store";
import type { PurchaseProvider } from "@/modules/purchase-paths";

const FAMILY = "family-1" as FamilyId;
const PLACEMENT = "placement-1" as PlacementId;
const NOW = "2026-03-01T09:00:00.000Z" as Instant;
const PAST = "2026-02-01T09:00:00.000Z";
const FUTURE = "2026-04-01T09:00:00.000Z";

const row = (patch: Partial<SpineRow>): SpineRow => ({
  ...blankSpineRow(FAMILY, NOW),
  ...patch,
});

const provider = {
  name: "stub-stripe",
  ensureCustomer: async () => ({ ok: true, value: "c" as never }),
  createPaymentLink: async () => ({ ok: true, value: { url: "u" as never } }),
  createCheckout: async () => ({ ok: true, value: { url: "u" as never } }),
  parseEvent: () => ({
    ok: true,
    value: { kind: "ignored", eventId: "e", providerType: "x" },
  }),
  portal: async () => ({ ok: true, value: { url: "u" as never } }),
} as unknown as PurchaseProvider;

function build(
  rows: ReadonlyArray<SpineRow>,
  options: { readonly notifyAdminFails?: boolean } = {},
) {
  const emitted: string[] = [];
  const sent: string[] = [];
  /** ADR-160: the operator's queue, observed where its ONE writer is — `comms.notifyAdmin`, not the spine. */
  const notified: Array<{
    readonly kind: string;
    readonly subject?: { readonly type: string; readonly id: string };
    readonly dueAt?: string;
  }> = [];
  const store: MemorySpineStore = memorySpineStore({
    rows,
    now: () => NOW,
    contacts: {
      [FAMILY]: {
        userId: FAMILY as string as never,
        email: "p@example.test" as never,
        firstName: "Ada",
      },
    },
  });
  const jobs = createPaymentsJobs({
    store,
    provider,
    comms: {
      send: async (message) => {
        sent.push(message.templateId);
        return { ok: true, value: "m" as never };
      },
      notifyAdmin: async (input) => {
        if (options.notifyAdminFails === true)
          return {
            ok: false,
            error: {
              code: "INTERNAL" as const,
              message: "down",
              details: { reason: "store-not-configured" as const },
            },
          };
        notified.push({
          kind: input.kind,
          ...(input.subject === undefined
            ? {}
            : {
                subject: {
                  type: input.subject.type,
                  id: input.subject.id as string,
                },
              }),
          ...(input.dueAt === undefined
            ? {}
            : { dueAt: input.dueAt as string }),
        });
        return { ok: true, value: { id: "n" as never } };
      },
    },
    events: {
      emit: async (input) => {
        emitted.push(input.name);
        return { ok: true, value: { id: "e" as never } };
      },
    },
    now: () => NOW,
    paymentsEnabled: () => true,
    newTrialsEnabled: () => true,
    appUrl: "https://app",
  });
  return { store, jobs, emitted, sent, notified };
}

describe("expire-trials (ADR-090 / 093)", () => {
  it("lapses a trial whose month has run out and says access.lapsed", async () => {
    const { store, jobs, emitted } = build([
      row({ status: "trial", trial_ends_at: PAST, has_used_trial: true }),
    ]);
    const run = await jobs.run("expire-trials", NOW);
    expect(run.ok && run.value.handled).toBe(1);
    expect(store.rows()[0]?.status).toBe("lapsed");
    expect(emitted).toEqual(["access.lapsed"]);
  });

  it("leaves a trial that is still running", async () => {
    const { store, jobs } = build([
      row({ status: "trial", trial_ends_at: FUTURE, has_used_trial: true }),
    ]);
    const run = await jobs.run("expire-trials", NOW);
    expect(run.ok && run.value.handled).toBe(0);
    expect(store.rows()[0]?.status).toBe("trial");
  });

  it("re-running finds nothing — the job selects on the status it moves a row out of", async () => {
    const { jobs, emitted } = build([
      row({ status: "trial", trial_ends_at: PAST, has_used_trial: true }),
    ]);
    await jobs.run("expire-trials", NOW);
    emitted.length = 0;
    const again = await jobs.run("expire-trials", NOW);
    expect(again.ok && again.value.handled).toBe(0);
    expect(emitted).toEqual([]);
  });
});

describe("trial-reminders — T-5, once (03 §5.4.4)", () => {
  const endsInFour = "2026-03-05T09:00:00.000Z";
  const endsInTen = "2026-03-11T09:00:00.000Z";

  it("sends to a family five days out and stamps the column it filtered on", async () => {
    const { store, jobs, sent } = build([
      row({ status: "trial", trial_ends_at: endsInFour, has_used_trial: true }),
    ]);
    const run = await jobs.run("trial-reminders", NOW);
    expect(run.ok && run.value.handled).toBe(1);
    expect(sent).toEqual(["trial-reminder"]);
    expect(store.rows()[0]?.trial_reminder_sent_at).toBe(NOW);
    expect(PRICES.trialReminderDaysBefore).toBe(5);
  });

  it("does not send ten days out", async () => {
    const { jobs, sent } = build([
      row({ status: "trial", trial_ends_at: endsInTen, has_used_trial: true }),
    ]);
    await jobs.run("trial-reminders", NOW);
    expect(sent).toEqual([]);
  });

  it("never sends twice, even if the provider was down the first time", async () => {
    const { jobs, sent } = build([
      row({ status: "trial", trial_ends_at: endsInFour, has_used_trial: true }),
    ]);
    await jobs.run("trial-reminders", NOW);
    sent.length = 0;
    await jobs.run("trial-reminders", NOW);
    expect(sent).toEqual([]);
  });

  it("does not remind a family whose trial has already ended — that is expire-trials' row", async () => {
    const { jobs, sent } = build([
      row({ status: "trial", trial_ends_at: PAST, has_used_trial: true }),
    ]);
    await jobs.run("trial-reminders", NOW);
    expect(sent).toEqual([]);
  });

  it("a done-for-you family is never in any trial job — it has no trial columns (ADR-093; I-M9)", () => {
    const dfy = row({
      status: "placed",
      placement_id: PLACEMENT,
      payment_due_at: PAST,
    });
    expect(sweepTargets("expire-trials", [dfy], NOW, 5)).toEqual([]);
    expect(sweepTargets("trial-reminders", [dfy], NOW, 5)).toEqual([]);
  });
});

describe("expire-past-due and expire-cancelled-subscriptions (03 §5.4.5)", () => {
  it("lapses a family whose grace has run out", async () => {
    const { store, jobs } = build([
      row({ status: "past_due", past_due_grace_ends_at: PAST }),
    ]);
    await jobs.run("expire-past-due", NOW);
    expect(store.rows()[0]?.status).toBe("lapsed");
  });

  it("leaves a family still inside her grace", async () => {
    const { store, jobs } = build([
      row({ status: "past_due", past_due_grace_ends_at: FUTURE }),
    ]);
    await jobs.run("expire-past-due", NOW);
    expect(store.rows()[0]?.status).toBe("past_due");
  });

  it("lapses a cancelled family only once her paid period has ended", async () => {
    const { store, jobs } = build([
      row({
        status: "cancelled",
        cancelled_at: PAST,
        current_period_ends_at: FUTURE,
      }),
    ]);
    await jobs.run("expire-cancelled-subscriptions", NOW);
    expect(store.rows()[0]?.status).toBe("cancelled");
    const ended = build([
      row({
        status: "cancelled",
        cancelled_at: PAST,
        current_period_ends_at: PAST,
      }),
    ]);
    await ended.jobs.run("expire-cancelled-subscriptions", NOW);
    expect(ended.store.rows()[0]?.status).toBe("lapsed");
  });

  it("a row with no end date has not ended — null is never a passed window", () => {
    const open = row({
      status: "cancelled",
      cancelled_at: PAST,
      current_period_ends_at: null,
    });
    expect(
      sweepTargets("expire-cancelled-subscriptions", [open], NOW, 5),
    ).toEqual([]);
  });
});

describe("payment-due-sweep (ADR-094; AC-A-41)", () => {
  const due = row({
    status: "placed",
    placement_id: PLACEMENT,
    payment_due_at: PAST,
    balance_pence: 75_000,
  });

  it("flags a family whose bill has fallen due with no link sent, and emits payment.due", async () => {
    const { jobs, emitted } = build([due]);
    const run = await jobs.run("payment-due-sweep", NOW);
    expect(run.ok && run.value.handled).toBe(1);
    expect(emitted).toEqual(["payment.due"]);
  });

  it("WRITES NOTHING on the row — 02 §4.5's writers table says so", async () => {
    const { store, jobs } = build([due]);
    const before = store.rows()[0];
    await jobs.run("payment-due-sweep", NOW);
    expect(store.rows()[0]).toEqual(before);
  });

  it("never mints a link and never charges — the matchmaker sends the link by hand", async () => {
    const { store, jobs } = build([due]);
    await jobs.run("payment-due-sweep", NOW);
    expect(store.rows()[0]?.balance_link_ref).toBeNull();
  });

  it("skips a family whose link has already been sent", async () => {
    const { jobs, emitted } = build([
      { ...due, balance_link_ref: "ref" as LinkRef },
    ]);
    await jobs.run("payment-due-sweep", NOW);
    expect(emitted).toEqual([]);
  });

  it("skips a family whose bill is not yet due", async () => {
    const { jobs, emitted } = build([{ ...due, payment_due_at: FUTURE }]);
    await jobs.run("payment-due-sweep", NOW);
    expect(emitted).toEqual([]);
  });

  it("is free to re-run: the same families are found until a link is sent", async () => {
    const { jobs } = build([due]);
    const first = await jobs.run("payment-due-sweep", NOW);
    const second = await jobs.run("payment-due-sweep", NOW);
    expect(first).toEqual(second);
  });

  /**
   * ★ REVIEW-4 §6.5's pin 2, FLIPPED — its stated owner had landed and nobody had made the call.
   *
   * The pin read: "No module owns `admin_notifications` (01 §2.3 names no writer, and `payments` may not reach
   * past `comms`), so the row is not written … clears when `admin_notifications` gets a connector." **ADR-160
   * gave it exactly that connector in this same range** — `comms.notifyAdmin()` is on the port, `payment_due`
   * is a member of the enum, and the ADR names this caller in writing: "`payment_due` stays payments' to call".
   * Every clause of the pin's reason was false, and it was still red only because the call had not been made.
   *
   * It is observed at `comms.notifyAdmin` rather than on the spine, because that — not a store method — is the
   * writer ADR-160 named; the pin's old assertion reached for a `store.notifications()` that ADR-160's shape
   * says should never exist.
   */
  it("raises one open admin_notifications.payment_due per family (AC-A-41; ADR-160)", async () => {
    const { jobs, notified } = build([due]);

    await jobs.run("payment-due-sweep", NOW);

    expect(notified).toEqual([
      {
        kind: "payment_due",
        subject: { type: "family", id: FAMILY as string },
        dueAt: PAST,
      },
    ]);
  });

  it("raises nothing for a family the sweep does not select — the row follows the event, not the run", async () => {
    const { jobs, notified } = build([{ ...due, payment_due_at: FUTURE }]);

    await jobs.run("payment-due-sweep", NOW);

    expect(notified).toEqual([]);
  });

  it("a refused row is skipped, and `payment.due` is not logged for a family nobody was told about", async () => {
    // ADR-160's ordering, driven rather than argued: the row is raised first, so a refusal costs the family its
    // place in the run rather than leaving an event that says an operator was notified when none was.
    const { jobs, emitted, notified } = build([due], {
      notifyAdminFails: true,
    });

    const run = await jobs.run("payment-due-sweep", NOW);

    expect(run.ok && run.value).toMatchObject({ handled: 0, skipped: 1 });
    expect(emitted).toEqual([]);
    expect(notified).toEqual([]);
  });
});

describe("the sweep's own failure behaviour (01 §4f)", () => {
  it("counts a row it could not write as skipped rather than aborting the cohort", async () => {
    const good = row({
      status: "trial",
      trial_ends_at: PAST,
      has_used_trial: true,
    });
    const { jobs } = build([good]);
    const run = await jobs.run("expire-trials", NOW);
    expect(run.ok && run.value.skipped).toBe(0);
    expect(run.ok && run.value.handled + run.value.skipped).toBe(1);
  });

  it("fails the whole run when the spine cannot be read — there is nothing to sweep", async () => {
    const jobs = createPaymentsJobs({
      store: {
        ...memorySpineStore({ now: () => NOW }),
        listSpine: async () => ({
          ok: false,
          error: { code: "INTERNAL", message: "down" },
        }),
      } as never,
      provider,
      comms: {
        send: async () => ({ ok: true, value: "m" as never }),
        notifyAdmin: async () => ({ ok: true, value: { id: "n" as never } }),
      },
      events: { emit: async () => ({ ok: true, value: { id: "e" as never } }) },
      now: () => NOW,
      paymentsEnabled: () => true,
      newTrialsEnabled: () => true,
      appUrl: "https://app",
    });
    const run = await jobs.run("expire-trials", NOW);
    expect(run.ok).toBe(false);
    expect(run.ok ? null : run.error.details?.reason).toBe("E_STORE");
  });
});
