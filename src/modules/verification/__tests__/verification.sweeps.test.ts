// The three named jobs `verification` owns (03 §4.3; ADR-161), over the memory world: the stale-`processing`
// sweep (I-V4) hands a section a provider never answered to a person; the reminder funnel (`08.11`) schedules
// LCY-1…4 from a nanny's last change while she is below the pool, keyed so every pass is idempotent, and never
// for a nanny already in it; the expiry sweep warns ahead (`vetting.expiry-approaching`) and expires what has
// lapsed (`expire_verification_section` → level recomputed, `vetting.expired`). Written RED first.
import { beforeEach, describe, expect, it } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import { configureComms } from "@/modules/comms";
import { VETTING } from "@/modules/config";
import {
  configureEvents,
  createEvents,
  log,
  memoryEventLogStore,
  ok,
} from "@/modules/platform";
import type { Email, Instant, UserId } from "@/modules/shared-types";
import {
  configureVettingStore,
  memoryVettingStore,
} from "@/modules/vetting-providers";
import type { MemoryVettingStore } from "@/modules/vetting-providers";
import {
  configureVerification,
  createVerification,
  memoryVerificationStore,
  verification,
} from "../index";
import { commsDouble } from "./fixtures/comms-double";
import type { CommsDouble } from "./fixtures/comms-double";

const NANNY = "11111111-1111-4111-8111-111111111111" as UserId;
const OTHER = "22222222-2222-4222-8222-222222222222" as UserId;
const NOW = "2026-09-18T10:00:00.000Z" as Instant;
const minutesAgo = (minutes: number): Instant =>
  new Date(Date.parse(NOW) - minutes * 60_000).toISOString() as Instant;
const daysAhead = (days: number): Instant =>
  new Date(Date.parse(NOW) + days * 86_400_000).toISOString() as Instant;

let ledger: MemoryVettingStore;
let events: ReturnType<typeof memoryEventLogStore>;
let comms: CommsDouble;

beforeEach(() => {
  // the jobs run with no session (a cron pass), at service scope
  configureAuth(
    stubAuth({
      users: [
        { id: NANNY, email: "amara@example.test" as Email, role: "nanny" },
        { id: OTHER, email: "other@example.test" as Email, role: "nanny" },
      ],
    }),
  );
  events = memoryEventLogStore();
  configureEvents(createEvents({ store: events, log }));
  comms = commsDouble();
  configureComms(comms);
  ledger = memoryVettingStore();
  configureVettingStore(ledger);
  configureVerification(
    createVerification({
      store: memoryVerificationStore(ledger),
      contactWriter: async () => ok(undefined),
    }),
  );
});

describe("sweepStaleProcessing (I-V4; ADR-157 (5))", () => {
  it("moves a section processing longer than VETTING.staleProcessingMinutes to review and leaves a fresh one", async () => {
    ledger.patchSections(NANNY, (row) => ({
      ...row,
      identity: {
        ...row.identity,
        status: "processing",
        statusAt: minutesAgo(VETTING.staleProcessingMinutes + 15),
      },
      dbs: { ...row.dbs, status: "processing", statusAt: minutesAgo(1) },
    }));
    const swept = await verification.sweepStaleProcessing(NOW);
    expect(swept.ok && swept.value).toEqual({ handled: 1, skipped: 0 });
    expect(ledger.sectionsOf(NANNY)?.identity.status).toBe("review");
    expect(ledger.sectionsOf(NANNY)?.dbs.status).toBe("processing");
  });
});

describe("sweepReminders (`08.11`; 03 §8.2 row 32; ADR-161)", () => {
  it("schedules LCY-1…4 from the last change for a nanny below the pool with a section open, keyed per step; a second pass adds nothing", async () => {
    ledger.patchSections(NANNY, (row) => ({
      ...row,
      level: "L1_REGISTERED",
      identity: {
        ...row.identity,
        status: "rejected",
        statusAt: minutesAgo(6),
      },
    }));
    const first = await verification.sweepReminders(NOW);
    expect(first.ok && first.value.handled).toBe(
      VETTING.reminderOffsetsMinutes.length,
    );
    const keys = comms.scheduled.map((m) => m.dedupeKey);
    expect(keys).toEqual(
      VETTING.reminderOffsetsMinutes.map(
        (_, i) => `verification-reminder:${NANNY}:${i}`,
      ),
    );
    expect(
      comms.scheduled.every((m) => m.templateId === "verification-reminder"),
    ).toBe(true);
    expect(comms.scheduled[0]?.sendAt).toBe(
      new Date(
        Date.parse(minutesAgo(6)) + VETTING.reminderOffsetsMinutes[0] * 60_000,
      ).toISOString(),
    );
    expect(
      comms.scheduled.map((m) => (m.data as { step: number }).step),
    ).toEqual([1, 2, 3, 4]);

    // a second pass asks comms for the same four keys; the dedupe answers the existing rows (03 §8.1) and no
    // fifth row appears — `handled` counts the offsets still ahead, idempotency is the seam's
    const second = await verification.sweepReminders(NOW);
    expect(second.ok && second.value).toEqual({ handled: 4, skipped: 0 });
    expect(comms.scheduled).toHaveLength(4);
  });

  it("schedules nothing for a nanny in the pool, and skips an offset already in the past", async () => {
    ledger.patchSections(OTHER, (row) => ({
      ...row,
      level: "L3_PROVISIONALLY_VERIFIED",
      identity: {
        ...row.identity,
        status: "verified",
        statusAt: minutesAgo(6),
      },
      dbs: { ...row.dbs, status: "verified", statusAt: minutesAgo(6) },
    }));
    ledger.patchSections(NANNY, (row) => ({
      ...row,
      level: "L1_REGISTERED",
      identity: {
        ...row.identity,
        status: "rejected",
        statusAt: minutesAgo(60),
      },
    }));
    const swept = await verification.sweepReminders(NOW);
    // the 30-minute one is behind us and is not sent late; the other three are queued
    expect(swept.ok && swept.value).toEqual({ handled: 3, skipped: 1 });
    expect(comms.scheduled.map((m) => m.to)).toEqual([
      { userId: NANNY },
      { userId: NANNY },
      { userId: NANNY },
    ]);
  });
});

describe("sweepExpiry (`vetting-expiry`; 03 §4.3; ADR-157 (4))", () => {
  it("warns inside the lead window and expires what has lapsed — the section expires, the level drops, the events land", async () => {
    // two verified sections through the ledger, the way a decision leaves them (the expiry job walks
    // `_provider_ref`, i.e. the decided submission — a section with no ledger row has nothing to expire)
    const evidence = (type: "identity-document" | "dbs-certificate") =>
      ({
        id: `${type}-1` as never,
        nannyId: NANNY,
        type,
        documents: [],
        declared: {},
        consent: {},
        submittedAt: minutesAgo(60),
      }) as const;
    const identity = await ledger.upsert({
      evidence: evidence("identity-document"),
      provider: "stub-manual",
      status: { kind: "needs-admin" },
    });
    const dbs = await ledger.upsert({
      evidence: evidence("dbs-certificate"),
      provider: "stub-manual",
      status: { kind: "needs-admin" },
    });
    if (!identity.ok || !dbs.ok) throw new Error("seed failed");
    ledger.applyResult(identity.value.submissionId, {
      kind: "verified",
      at: minutesAgo(30),
      expiresAt: daysAhead(VETTING.expiryLeadDays - 5),
    });
    ledger.applyResult(dbs.value.submissionId, {
      kind: "verified",
      at: minutesAgo(30),
      expiresAt: daysAhead(-1),
    });
    ledger.patchSections(NANNY, (row) => ({
      ...row,
      level: "L3_PROVISIONALLY_VERIFIED",
      dbsOutcome: "cleared",
      crossCheckPassed: true,
    }));
    const swept = await verification.sweepExpiry(NOW);
    expect(swept.ok && swept.value).toEqual({ handled: 2, skipped: 0 });
    const names = events.rows.map((row) => row.name);
    expect(names).toContain("vetting.expiry-approaching");
    expect(names).toContain("vetting.expired");
    expect(names).toContain("verification.level-changed");
    expect(ledger.sectionsOf(NANNY)?.dbs.status).toBe("expired");
    expect(ledger.sectionsOf(NANNY)?.level).toBe("L2_ID_VERIFIED");
    expect(ledger.sectionsOf(NANNY)?.identity.status).toBe("verified");
  });
});
