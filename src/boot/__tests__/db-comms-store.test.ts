// The `email_logs` / `inbox_messages` store of `comms` (03 §8.1; 02 R-3 / R-10) over `auth`'s port — ADR-131 (1)
// gave the port the keyed read this store needs. Service scope throughout: `email_logs` carries an admin SELECT
// only and `inbox_messages` no client INSERT (0011), so comms writes both under the service role (07 §5.1 rule 5,
// named in `auth`'s README). The contract's `dry-run` is the column's `dry_run` (comms README gap 2) — mapped at
// this seam, both ways, never renamed on either side.
import { describe, expect, it } from "vitest";
import type { InboxMessage, RenderedEmail } from "@/modules/comms";
import type { MessageId } from "@/modules/shared-types";
import { dbCommsStore } from "../db-comms-store";
import { fakeDataPort } from "./fixtures/fake-data-port";

const NOW = "2026-09-17T03:00:00.000Z";
const clock = () => NOW as never;
const MESSAGE_ID = "11111111-1111-4111-8111-111111111111" as MessageId;

const rendered: RenderedEmail = {
  messageId: MESSAGE_ID,
  to: { email: "someone@example.test" as never, userId: "u-1" as never },
  from: "noreply" as never,
  subject: "Welcome",
  html: "<p>hi</p>",
  text: "hi",
};

const logRow = (over: Record<string, unknown>) => ({
  id: MESSAGE_ID,
  channel: "email",
  template_id: "welcome-parent",
  status: "queued",
  dedupe_key: "k-1",
  provider_message_id: null,
  sent_at: null,
  ...over,
});

describe("dbCommsStore — email_logs", () => {
  it("findLiveByDedupeKey is a keyed read on dedupe_key and answers the live (queued | sent) row's id", async () => {
    const fake = fakeDataPort({
      email_logs: [
        logRow({ id: "old", status: "cancelled" }),
        logRow({ id: "live", status: "sent" }),
      ],
    });
    const result = await dbCommsStore(fake.port, clock).findLiveByDedupeKey(
      "k-1",
    );
    expect(result).toEqual({ ok: true, value: "live" });
    expect(fake.calls).toEqual([
      { name: "comms.findLiveByDedupeKey", scope: "service", uow: undefined },
    ]);
    expect(fake.keyedReads).toEqual([
      { table: "email_logs", column: "dedupe_key", value: "k-1" },
    ]);
  });

  it("findLiveByDedupeKey answers null when nothing live carries the key", async () => {
    const fake = fakeDataPort({
      email_logs: [logRow({ id: "old", status: "cancelled" })],
    });
    expect(
      await dbCommsStore(fake.port, clock).findLiveByDedupeKey("k-1"),
    ).toEqual({ ok: true, value: null });
  });

  it("record inserts one email_logs row under the service role, the contract's dry-run as the column's dry_run", async () => {
    const fake = fakeDataPort();
    const result = await dbCommsStore(fake.port, clock).record({
      ...rendered,
      templateId: "welcome-parent",
      channel: "email",
      status: "dry-run",
      dedupeKey: "k-1",
      sendAt: "2026-09-18T09:00:00.000Z" as never,
    });
    expect(result).toEqual({ ok: true, value: MESSAGE_ID });
    expect(fake.calls[0]).toEqual({
      name: "comms.record",
      scope: "service",
      uow: undefined,
    });
    expect(fake.inserted).toEqual([
      {
        table: "email_logs",
        row: {
          id: MESSAGE_ID,
          channel: "email",
          template_id: "welcome-parent",
          recipient_user_id: "u-1",
          recipient_email: "someone@example.test",
          subject: "Welcome",
          body_html: "<p>hi</p>",
          body_text: "hi",
          status: "dry_run",
          send_at: "2026-09-18T09:00:00.000Z",
          dedupe_key: "k-1",
          from_key: "noreply",
        },
      },
    ]);
  });

  it("settle updates the row by id: sent carries provider id + sent_at, failed stamps failed_at from the clock", async () => {
    // M-13: the row has to be there now — a settle against a message that does not exist is a refusal.
    const fake = fakeDataPort({ email_logs: [logRow({})] });
    const store = dbCommsStore(fake.port, clock);
    await store.settle(MESSAGE_ID, {
      status: "sent",
      providerMessageId: "re_1",
      sentAt: "2026-09-17T03:00:01.000Z" as never,
    });
    await store.settle(MESSAGE_ID, { status: "failed" });
    expect(fake.updated).toEqual([
      {
        table: "email_logs",
        id: MESSAGE_ID,
        patch: {
          status: "sent",
          provider_message_id: "re_1",
          sent_at: "2026-09-17T03:00:01.000Z",
        },
      },
      {
        table: "email_logs",
        id: MESSAGE_ID,
        patch: { status: "failed", failed_at: NOW },
      },
    ]);
  });

  it("read is a keyed single read on id; the column's dry_run comes back as the contract's dry-run", async () => {
    const fake = fakeDataPort({
      email_logs: [
        logRow({
          status: "dry_run",
          provider_message_id: "re_9",
          sent_at: "2026-09-17T03:00:01.000Z",
        }),
      ],
    });
    const result = await dbCommsStore(fake.port, clock).read(MESSAGE_ID);
    expect(result).toEqual({
      ok: true,
      value: {
        status: "dry-run",
        providerMessageId: "re_9",
        sentAt: "2026-09-17T03:00:01.000Z",
      },
    });
    expect(fake.keyedReads).toEqual([
      { table: "email_logs", column: "id", value: MESSAGE_ID },
    ]);
  });

  it("read answers NOT_FOUND / unknown-message for an id that has no row — never a made-up status", async () => {
    const fake = fakeDataPort();
    const result = await dbCommsStore(fake.port, clock).read(MESSAGE_ID);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("NOT_FOUND");
    expect(!result.ok && result.error.details?.reason).toBe("unknown-message");
  });

  it("cancelByDedupeKey cancels the queued rows only and counts them", async () => {
    const fake = fakeDataPort({
      email_logs: [
        logRow({ id: "q1", status: "queued" }),
        logRow({ id: "s1", status: "sent" }),
        logRow({ id: "q2", status: "queued" }),
      ],
    });
    const result = await dbCommsStore(fake.port, clock).cancelByDedupeKey(
      "k-1",
    );
    expect(result).toEqual({ ok: true, value: { cancelled: 2 } });
    expect(fake.updated.map((u) => u.id)).toEqual(["q1", "q2"]);
    expect(fake.updated[0]?.patch).toEqual({
      status: "cancelled",
      cancelled_reason: "dedupe-key-cancelled",
    });
  });

  it("a port failure comes back as the carried Result, never a throw", async () => {
    const fake = fakeDataPort();
    fake.state.failWith = {
      code: "INTERNAL",
      message: "down",
      details: { reason: "db-unreachable" },
    };
    const result = await dbCommsStore(fake.port, clock).read(MESSAGE_ID);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toBe("down");
  });
});

describe("dbCommsStore — inbox_messages", () => {
  const message: InboxMessage = {
    userId: "u-1" as never,
    type: "call-confirmed",
    title: "Your call is booked",
    body: "Tuesday 10:00",
    actionUrl: "https://example.test/calls/1" as never,
    reference: { type: "booking", id: "22222222-2222-4222-8222-222222222222" },
    actor: {
      kind: "admin",
      id: "a-1" as never,
      onBehalfOf: { role: "parent", id: "u-1" as never },
    },
  };

  it("createInboxMessage inserts one row under the service role and answers the id the row got", async () => {
    const fake = fakeDataPort();
    const result = await dbCommsStore(fake.port, clock).createInboxMessage(
      message,
    );
    expect(result.ok).toBe(true);
    expect(fake.calls).toEqual([
      { name: "comms.createInboxMessage", scope: "service", uow: undefined },
    ]);
    const [insert] = fake.inserted;
    expect(insert?.table).toBe("inbox_messages");
    expect(insert?.row).toEqual({
      id: expect.any(String),
      user_id: "u-1",
      type: "call-confirmed",
      title: "Your call is booked",
      body: "Tuesday 10:00",
      action_url: "https://example.test/calls/1",
      reference_type: "booking",
      reference_id: "22222222-2222-4222-8222-222222222222",
      actor: "admin",
      on_behalf_of_user_id: "u-1",
    });
    expect(result.ok && result.value.id).toBe(insert?.row.id);
  });

  it("passes a { uow } through to the port (ADR-127 decides what happens to it there)", async () => {
    const fake = fakeDataPort();
    const uow = {} as never;
    await dbCommsStore(fake.port, clock).createInboxMessage(message, { uow });
    expect(fake.calls[0]?.uow).toBe(uow);
  });
});

// ── M-13 (REVIEW-2) — a settle that matched nothing is not a settle ────────────────────────────────────────
//
// `settle` discarded the update's result, so a patch matching zero rows was indistinguishable from one that
// matched and `comms` was told `ok`. The consequence is quiet: a provider callback for a message id we do not
// hold reports success, and the send's real state is never written anywhere. RED first.
describe("dbCommsStore — settle refuses an unknown message (M-13)", () => {
  it("answers the documented not-found refusal, and writes nothing", async () => {
    const fake = fakeDataPort({ email_logs: [] });
    const settled = await dbCommsStore(fake.port, clock).settle(MESSAGE_ID, {
      status: "failed",
    });
    expect(settled.ok).toBe(false);
    if (!settled.ok)
      expect(settled.error.details?.reason).toBe("unknown-message");
    expect(fake.updated).toEqual([]);
  });
});

describe("dbCommsStore — createAdminNotification, the one writer of admin_notifications (ADR-160)", () => {
  it("inserts one row under the service role with the kind, subject, summary and due-at", async () => {
    const fake = fakeDataPort({ admin_notifications: [] });
    const raised = await dbCommsStore(fake.port, clock).createAdminNotification({
      kind: "commission_call_booked",
      subject: { type: "booking", id: MESSAGE_ID as never },
      summary: "A nanny booked a commission call.",
      dueAt: NOW as never,
    });
    expect(raised.ok).toBe(true);
    expect(fake.calls.map((c) => c.scope)).toEqual(["service"]);
    expect(fake.inserted).toEqual([
      {
        table: "admin_notifications",
        row: expect.objectContaining({
          kind: "commission_call_booked",
          subject_type: "booking",
          subject_id: MESSAGE_ID,
          summary: "A nanny booked a commission call.",
          due_at: NOW,
        }),
      },
    ]);
  });

  it("answers the open row for the same (kind, subject) rather than inserting a second (the open-row index, 0011)", async () => {
    const fake = fakeDataPort({
      admin_notifications: [
        {
          id: "n-open",
          kind: "nanny_barred",
          subject_type: "nanny",
          subject_id: MESSAGE_ID,
          acknowledged_at: null,
        },
      ],
    });
    const raised = await dbCommsStore(fake.port, clock).createAdminNotification({
      kind: "nanny_barred",
      subject: { type: "nanny", id: MESSAGE_ID as never },
      summary: "again",
    });
    expect(raised.ok && raised.value.id).toBe("n-open");
    expect(fake.inserted).toEqual([]);
  });
});
