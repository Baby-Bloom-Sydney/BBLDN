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
  // `1f` replaced the stub with the db inside in EVERY environment. The two cases these replace were P1-WIRE's
  // honest record of a gap ("there is no inside, and here is why production must not get the stub"); with the
  // gap closed they assert what is now true, and the one thing that matters is asserted on a REASON rather than
  // on a happy path — a port that answered by accident could not pass.
  it("binds the db inside, and production is no longer left fail-closed", async () => {
    const report = wireScheduling();
    expect(report.binding).toBe("db inside");
    expect(report.reason).toContain("book_slot()");
    const swept = await scheduling.expireHolds(NOW);
    // `auth` is unconfigured in this suite, so the read fails — but it fails as the CALENDAR, not as the
    // fail-closed default, which is what proves the binding replaced it.
    expect(!swept.ok && swept.error.details?.reason).not.toBe(
      "SCHEDULING_NOT_CONFIGURED",
    );
  });

  it("still refuses with its own named reason while nothing has wired it", async () => {
    configureScheduling(unconfiguredScheduling);
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
