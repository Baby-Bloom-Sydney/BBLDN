// 03 §11 row 7 — the comms swap test, in the part that is reachable today (no template file and no
// `email_logs` table exist yet, so the store and the renderer are test doubles, not the real inside).
import { beforeEach, describe, expect, it } from "vitest";
import type { Email, MessageId } from "@/modules/shared-types";
import {
  comms,
  configureComms,
  createComms,
  emailProviderFor,
  nullSmsProvider,
  stubEmailProvider,
  TEMPLATE_IDS,
  unconfiguredComms,
} from "../index";
import type { Comms, Message } from "../types";
import { fakeRenderer, memoryCommsStore } from "./fixtures/memory-comms";

const message = (over: Partial<Message> = {}): Message => ({
  channel: "email",
  templateId: "welcome-parent",
  to: { email: "someone@example.test" as Email },
  data: {},
  ...over,
});

describe("comms — the provider is chosen by config, never by an import (05 §3 rule 1)", () => {
  it("binds stub-email when config says stub-email", () => {
    const chosen = emailProviderFor("stub-email");
    expect(chosen.ok && chosen.value.id).toBe("stub-email");
  });

  it("refuses resend loudly rather than falling back to the stub", () => {
    const chosen = emailProviderFor("resend");
    expect(chosen.ok).toBe(false);
    expect(!chosen.ok && chosen.error.details?.reason).toBe(
      "comms-not-configured",
    );
  });
});

describe("comms — the seam runs over stub-email with nothing else changed (03 §11 row 7)", () => {
  beforeEach(() => {
    stubEmailProvider.reset();
    configureComms(unconfiguredComms);
  });

  it("records the row, hands the provider the rendered message and settles it sent", async () => {
    const store = memoryCommsStore();
    const seam = createComms({
      email: stubEmailProvider,
      sms: nullSmsProvider,
      store,
      renderer: fakeRenderer,
    });

    const sent = await seam.send(message());

    expect(sent.ok).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]?.templateId).toBe("welcome-parent");
    expect(store.rows[0]?.status).toBe("sent");
    expect(stubEmailProvider.sent).toHaveLength(1);
    expect(store.rows[0]?.providerMessageId).toContain("stub-email");
  });

  it("returns the existing id for a live dedupe key instead of sending twice", async () => {
    const store = memoryCommsStore();
    const seam = createComms({
      email: stubEmailProvider,
      sms: nullSmsProvider,
      store,
      renderer: fakeRenderer,
    });

    const first = await seam.send(message({ dedupeKey: "welcome:1" }));
    const second = await seam.send(message({ dedupeKey: "welcome:1" }));

    expect(first.ok && second.ok && first.value).toBe(
      second.ok ? second.value : undefined,
    );
    expect(stubEmailProvider.sent).toHaveLength(1);
  });

  it("schedule writes a queued row and delivers nothing (01 §4f does that later)", async () => {
    const store = memoryCommsStore();
    const seam = createComms({
      email: stubEmailProvider,
      sms: nullSmsProvider,
      store,
      renderer: fakeRenderer,
    });

    const later = "2099-01-01T09:00:00.000Z" as Message["sendAt"] & string;
    const queued = await seam.schedule({ ...message(), sendAt: later });

    expect(queued.ok).toBe(true);
    expect(store.rows[0]?.status).toBe("queued");
    expect(stubEmailProvider.sent).toHaveLength(0);
  });
});

describe("comms — the sms slot exists and does nothing (N-11, ADR-063)", () => {
  it("rejects channel sms before any provider is reached", async () => {
    const store = memoryCommsStore();
    const seam = createComms({
      email: stubEmailProvider,
      sms: nullSmsProvider,
      store,
      renderer: fakeRenderer,
    });

    const refused = await seam.send(message({ channel: "sms" }));

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.details?.reason).toBe(
      "sms-not-available",
    );
    expect(store.rows).toHaveLength(0);
  });

  it("null-sms says so rather than pretending, if it is ever reached", async () => {
    const attempt = await nullSmsProvider.send({
      to: "" as never,
      body: "",
      senderId: "",
    });
    expect(attempt.ok).toBe(false);
    expect(!attempt.ok && attempt.error.code).toBe("PROVIDER_ERROR");
  });
});

describe("comms — delete the module, drop in a folder honouring §8.1 (03 §11 row 7 last clause)", () => {
  beforeEach(() => configureComms(unconfiguredComms));

  it("the module-level binding follows configureComms with no caller change", async () => {
    const before = await comms.send(message());
    expect(before.ok).toBe(false);
    expect(!before.ok && before.error.details?.reason).toBe(
      "comms-not-configured",
    );

    const replacement: Comms = {
      ...unconfiguredComms,
      send: async () => ({ ok: true, value: "swapped" as MessageId }),
    };
    configureComms(replacement);

    const after = await comms.send(message());
    expect(after.ok && after.value).toBe("swapped");
  });
});

describe("comms — the template registry (03 §8.2)", () => {
  it("names every id exactly once", () => {
    expect(new Set(TEMPLATE_IDS).size).toBe(TEMPLATE_IDS.length);
  });

  // 4a: 46 → 48. The count moved because the REGISTRY moved, not because the list was padded — ADR-168 (b)
  // added `verification-suspension-lifted` and `admin-nanny-suspension-lifted` to `TemplateRegistry` and left
  // this list alone, so `validate-message.ts` refused both with `unknown-template`. `EveryTemplateIdIsListed`
  // (comms/types.ts) is now the gate; this case is the count it produces, kept because a bare typecheck assert
  // is invisible in a test report.
  it("carries the 48 ids TemplateRegistry declares (03 §8.2's heading says 46 — see README Gaps)", () => {
    expect(TEMPLATE_IDS.length).toBe(48);
  });

  it("rejects a template id that is not in the registry", async () => {
    const store = memoryCommsStore();
    const seam = createComms({
      email: stubEmailProvider,
      sms: nullSmsProvider,
      store,
      renderer: fakeRenderer,
    });

    const refused = await seam.send(
      message({ templateId: "bsr-request" as never }),
    );

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.details?.reason).toBe(
      "unknown-template",
    );
  });
});
