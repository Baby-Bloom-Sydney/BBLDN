// ADR-136 — `comms` resolves a recipient's address from a user id inside its own store, at service scope;
// callers pass ids and never handle email addresses.
//
// The claims this unit's merge rests on (ADR-120 rule 1). The one that matters most is the last: a business
// module must be **unable** to obtain an address, which is what makes this ruling stricter than the rule it
// replaced ("the caller passes fully resolved data") rather than a loosening of it.
import { beforeEach, describe, expect, it } from "vitest";
import type { Email, Uuid } from "@/modules/shared-types";
import { createComms, nullSmsProvider, stubEmailProvider } from "../index";
import type { Comms, Message, ResolvedRecipient } from "../types";
import { fakeRenderer, memoryCommsStore } from "./fixtures/memory-comms";

const NANNY_USER = "00000000-0000-4000-8000-0000000000u1" as Uuid;
const NOBODY = "00000000-0000-4000-8000-0000000000u9" as Uuid;

const directory = () =>
  new Map<string, ResolvedRecipient>([
    [
      NANNY_USER as string,
      { email: "grace@example.test" as Email, name: "Grace" },
    ],
  ]);

const seam = (store = memoryCommsStore(directory())) => ({
  store,
  comms: createComms({
    email: stubEmailProvider,
    sms: nullSmsProvider,
    store,
    renderer: fakeRenderer,
  }) satisfies Comms,
});

/** The K row `1g` could not send: 03 §2.4 K-1's side effect is `connection-requested` **to the nanny**. */
const kRow = (over: Partial<Message> = {}): Message => ({
  channel: "email",
  templateId: "connection-requested",
  to: { userId: NANNY_USER },
  data: {},
  ...over,
});

beforeEach(() => {
  stubEmailProvider.reset();
});

describe("comms — a recipient named by id (ADR-136)", () => {
  it("resolves a K-row send addressed by nanny id and logs the resolved address on the row", async () => {
    const { store, comms } = seam();
    const sent = await comms.send(kRow());

    expect(sent.ok).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]?.templateId).toBe("connection-requested");
    // 02 §4.6 / 07 §6.1 step 4: the address comes to rest on `email_logs` and nowhere else.
    expect(store.rows[0]?.to).toEqual({
      email: "grace@example.test",
      userId: NANNY_USER,
      name: "Grace",
    });
    expect(store.rows[0]?.status).toBe("sent");
  });

  it("hands the provider an address the caller never supplied", async () => {
    const { comms } = seam();
    await comms.send(kRow());
    expect(stubEmailProvider.sent[0]?.to.email).toBe("grace@example.test");
  });

  it("★ never returns the address — a caller gets a MessageId and nothing else", async () => {
    const { comms } = seam();
    const sent = await comms.send(kRow());
    // The whole answer, serialised: if an address ever leaked through the connector it would appear here.
    expect(JSON.stringify(sent)).not.toContain("grace@example.test");
    expect(sent.ok && typeof sent.value).toBe("string");
  });

  it("prefers the person's own name over the one the caller guessed", async () => {
    const { store, comms } = seam();
    await comms.send(kRow({ to: { userId: NANNY_USER, name: "G." } }));
    expect(store.rows[0]?.to.name).toBe("Grace");
  });

  it("keeps the caller's name when the profile has none — a not-yet-named user still gets a greeting", async () => {
    const store = memoryCommsStore(
      new Map<string, ResolvedRecipient>([
        [NANNY_USER as string, { email: "grace@example.test" as Email }],
      ]),
    );
    const { comms } = seam(store);
    await comms.send(kRow({ to: { userId: NANNY_USER, name: "Grace" } }));
    expect(store.rows[0]?.to.name).toBe("Grace");
  });
});

describe("comms — the `{ email }` branch, for someone who is not a user yet", () => {
  it("still sends to a plain address (a lead, a public contact form)", async () => {
    const { store, comms } = seam();
    const sent = await comms.send(
      kRow({
        templateId: "contact-request-public",
        to: { email: "lead@example.test" as Email },
      }),
    );
    expect(sent.ok).toBe(true);
    expect(store.rows[0]?.to).toEqual({ email: "lead@example.test" });
  });

  it("refuses a malformed address with `invalid-recipient` and writes no row", async () => {
    const { store, comms } = seam();
    const sent = await comms.send(kRow({ to: { email: "nope" as Email } }));
    expect(sent.ok).toBe(false);
    expect(!sent.ok && sent.error.details?.reason).toBe("invalid-recipient");
    expect(store.rows).toHaveLength(0);
  });
});

describe("comms — the refusal tells a caller nothing about who exists (07 §4)", () => {
  it("answers a user id nothing resolves with the SAME reason a malformed address gets", async () => {
    const { store, comms } = seam();
    const unknown = await comms.send(kRow({ to: { userId: NOBODY } }));
    const malformed = await comms.send(
      kRow({ to: { email: "nope" as Email } }),
    );

    expect(unknown.ok).toBe(false);
    expect(!unknown.ok && unknown.error.details?.reason).toBe(
      "invalid-recipient",
    );
    expect(!unknown.ok && unknown.error.message).toEqual(
      !malformed.ok ? malformed.error.message : "different",
    );
    expect(store.rows).toHaveLength(0);
  });

  it("costs no lookup when a live dedupe key already answers — the resolution is inside the send, not before it", async () => {
    const { store, comms } = seam();
    await comms.send(kRow({ dedupeKey: "k-1:c1" }));
    const again = await comms.send(
      kRow({ dedupeKey: "k-1:c1", to: { userId: NOBODY } }),
    );
    // The second call names a user nothing resolves and still succeeds: it never reached the directory.
    expect(again.ok).toBe(true);
    expect(store.rows).toHaveLength(1);
  });
});
