// ADR-160 — `admin_notifications` has one writer: `comms.notifyAdmin()`. The seam records one row through its
// store (idempotent on the open-row index — the store's business), refuses a kind outside 02 §3's enum before the
// store is reached, and the fail-closed default refuses like every other method. Written RED first.
import { beforeEach, describe, expect, it } from "vitest";
import { ENUMS } from "@/modules/shared-types";
import type { Uuid } from "@/modules/shared-types";
import {
  comms,
  configureComms,
  createComms,
  nullSmsProvider,
  stubEmailProvider,
  unconfiguredComms,
} from "../index";
import { fakeRenderer, memoryCommsStore } from "./fixtures/memory-comms";

const NANNY = "11111111-1111-4111-8111-111111111111" as Uuid;

describe("comms.notifyAdmin (ADR-160)", () => {
  beforeEach(() => {
    configureComms(unconfiguredComms);
  });

  it("records one admin_notifications row through the store with the kind, subject and summary", async () => {
    const store = memoryCommsStore();
    const seam = createComms({
      email: stubEmailProvider,
      sms: nullSmsProvider,
      store,
      renderer: fakeRenderer,
    });
    const raised = await seam.notifyAdmin({
      kind: "nanny_barred",
      subject: { type: "nanny", id: NANNY },
      summary: "A nanny's DBS decision was adverse; her account is suspended.",
    });
    expect(raised.ok).toBe(true);
    expect(store.adminNotifications).toEqual([
      expect.objectContaining({
        kind: "nanny_barred",
        subject: { type: "nanny", id: NANNY },
      }),
    ]);
  });

  it("refuses a kind outside 02 §3's enum before the store is reached", async () => {
    const store = memoryCommsStore();
    const seam = createComms({
      email: stubEmailProvider,
      sms: nullSmsProvider,
      store,
      renderer: fakeRenderer,
    });
    const raised = await seam.notifyAdmin({
      kind: "verification_review" as never,
      summary: "not a kind",
    });
    expect(!raised.ok && raised.error.details?.reason).toBe("unknown-kind");
    expect(store.adminNotifications).toEqual([]);
    expect(ENUMS.admin_notification_kind).not.toContain("verification_review");
  });

  it("the fail-closed default refuses (comms-not-configured)", async () => {
    const raised = await comms.notifyAdmin({
      kind: "commission_call_booked",
      summary: "x",
    });
    expect(!raised.ok && raised.error.details?.reason).toBe(
      "comms-not-configured",
    );
  });
});
