// The two seams whose binding turns on the resolved environment / a provider name (05 §3 rule 1): `scheduling`
// gets the in-memory stub outside production and stays fail-closed in production; `comms` binds the provider
// `EMAIL_PROVIDER` names, refuses one that is not installed, and installs the missing store / renderer
// fail-closed with the reason each reserves. Each case is proved on the module-level binding, not the report.
import { afterEach, describe, expect, it } from "vitest";
import type { Email } from "@/modules/shared-types";
import { comms, configureComms, unconfiguredComms } from "@/modules/comms";
import {
  configureScheduling,
  scheduling,
  unconfiguredScheduling,
} from "@/modules/scheduling";
import { wireComms } from "../wire-comms";
import { wireScheduling } from "../wire-scheduling";

const NOW = "2026-09-17T09:00:00.000Z" as never;
const MESSAGE = {
  channel: "email" as const,
  templateId: "welcome-parent" as const,
  to: { email: "someone@example.test" as Email },
  data: {},
};

afterEach(() => {
  configureScheduling(unconfiguredScheduling);
  configureComms(unconfiguredComms);
});

describe("wireScheduling", () => {
  it("installs the in-memory stub outside production, with the reason on the report", async () => {
    const report = wireScheduling("preview");
    expect(report.binding).toBe("in-memory stub");
    expect(report.reason).toContain("cold start");
    expect(await scheduling.expireHolds(NOW)).toEqual({
      ok: true,
      value: { expired: 0 },
    });
  });

  it("leaves production on the fail-closed default — a cold start would drop live bookings silently", async () => {
    const report = wireScheduling("production");
    expect(report.binding).toBe("unconfigured");
    const result = await scheduling.expireHolds(NOW);
    expect(!result.ok && result.error.details?.reason).toBe(
      "SCHEDULING_NOT_CONFIGURED",
    );
  });
});

describe("wireComms", () => {
  it("binds stub-email + null-sms and a send fails with the renderer's reason, not comms-not-configured", async () => {
    const report = wireComms("stub-email");
    expect(report.binding).toBe("stub-email + null-sms");
    const sent = await comms.send(MESSAGE);
    expect(!sent.ok && sent.error.details?.reason).toBe(
      "renderer-not-configured",
    );
  });

  it("refuses a provider that is not installed and leaves the seam fail-closed", async () => {
    const report = wireComms("resend");
    expect(report.binding).toBe("unconfigured");
    const sent = await comms.send(MESSAGE);
    expect(!sent.ok && sent.error.details?.reason).toBe("comms-not-configured");
  });
});
