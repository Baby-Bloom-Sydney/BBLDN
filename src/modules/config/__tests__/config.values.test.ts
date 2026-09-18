// The config layer's values (01 §3.1; HANDOFF §5.1–5.2; §10 C1): one export per file, frozen, integer pence,
// ADR-076 scheduling defaults, every cron of 01 §4f, the mirrors pinned equal to shared-types.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as universal from "@/modules/config";
import * as server from "@/modules/config/server";
import type {
  BucketKey as ConfigBucketKey,
  EvidenceType as ConfigEvidenceType,
  PaymentLinkKind as ConfigPaymentLinkKind,
  VerificationLevelKey as ConfigVerificationLevelKey,
  VettingProviderId as ConfigVettingProviderId,
} from "@/modules/config/types";
import { SYSTEM_JOB_NAMES } from "@/modules/shared-types";
import type {
  BucketKey,
  EnumValue,
  EvidenceType,
  ProviderId,
} from "@/modules/shared-types";
import { ENUMS } from "@/modules/shared-types";

const CONFIG_DIR = resolve(__dirname, "..");
const BARRELS = new Set(["index.ts", "types.ts"]);
const CRON_COUNT = 24; // 01 §4f: 13 carried + 8 named sweeps (01 §9) + usage-weekly-check + payment-due-sweep + purge-scrubbed-users (L-009 3g)
const ADR_076 = {
  slotMinutes: 30,
  horizonDays: 14,
  leadTimeMinutes: 120,
  holdTtlSeconds: 300,
};

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
const evidenceTypesAgree: Equals<ConfigEvidenceType, EvidenceType> = true;
const bucketKeysAgree: Equals<ConfigBucketKey, BucketKey> = true;
const linkKindsAgree: Equals<
  ConfigPaymentLinkKind,
  EnumValue<"payment_link_kind">
> = true;
const levelKeysAgree: Equals<
  ConfigVerificationLevelKey,
  EnumValue<"verification_level">
> = true;
const providerIdsAgree: ConfigVettingProviderId extends ProviderId
  ? true
  : false = true;

function exportLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => /^export\s/.test(line));
}

function isDeepFrozen(value: unknown, path = "root"): string[] {
  if (value === null || typeof value !== "object") return [];
  if (!Object.isFrozen(value)) return [path];
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => isDeepFrozen(child, `${path}.${key}`),
  );
}

describe("config — one export per file (build-standard L1; 05 §7 rule 4)", () => {
  const topLevel = readdirSync(CONFIG_DIR).filter(
    (f) => f.endsWith(".ts") && !BARRELS.has(f),
  );
  const lib = readdirSync(resolve(CONFIG_DIR, "lib")).map((f) => `lib/${f}`);

  it.each([...topLevel, ...lib])("%s exports exactly one thing", (file) => {
    const lines = exportLines(resolve(CONFIG_DIR, file));
    expect(lines, lines.join("\n")).toHaveLength(1);
    if (!file.startsWith("lib/"))
      expect(lines[0]).toMatch(/^export const [A-Za-z_]+(: [^=]+)?( =|$)/);
  });

  it("names exactly the files 01 §3.1 lists (+ the client reader) and the barrels", () => {
    expect([...topLevel, ...BARRELS].sort()).toEqual(
      [
        "app.ts",
        "areas-source.ts",
        "brand.ts",
        "connections.ts",
        "consent.ts",
        "crons.ts",
        "domain.ts",
        "env.ts",
        "flags.ts",
        "index.ts",
        "katie.ts",
        "launch.ts",
        "legal.ts",
        "locale.ts",
        "matching.ts",
        "meta-events.ts",
        "offer.ts",
        "prices.ts",
        "public-env.ts",
        "public-flags.ts",
        "scheduling.ts",
        "security.ts",
        "senders.ts",
        "testUserDomain.ts",
        "types.ts",
        "uploads.ts",
        "urls.ts",
        "vetting.ts",
      ].sort(),
    );
  });

  it("keeps every value frozen all the way down and the server barrel a superset of the universal one", () => {
    for (const [name, value] of Object.entries(server))
      expect(isDeepFrozen(value, name)).toEqual([]);
    for (const name of Object.keys(universal))
      expect(server).toHaveProperty(name);
    for (const name of ["env", "FLAGS", "SENDERS", "AREAS_SOURCE", "KATIE"])
      expect(universal).not.toHaveProperty(name);
  });
});

describe("config — values from the foundations (01 §3.1)", () => {
  it("BRAND · LOCALE · DOMAIN · URLS · SENDERS hang off one base URL (ADR-029 / 033)", () => {
    expect(universal.BRAND.longName.startsWith(universal.BRAND.name)).toBe(
      true,
    );
    expect(Object.keys(universal.LOCALE).sort()).toEqual([
      "currency",
      "locale",
      "phoneCountry",
      "phonePrefix",
      "timezone",
    ]);
    expect(universal.URLS.app).toBe(universal.publicEnv.NEXT_PUBLIC_APP_URL);
    expect(new URL(universal.URLS.invite).host).toBe(universal.DOMAIN);
    expect(Object.keys(server.SENDERS).sort()).toEqual([
      "admin",
      "hello",
      "nannies",
      "noreply",
      "parents",
      "support",
      "verification",
    ]);
    expect(server.SENDERS.admin.address).toBe(server.env.server.ADMIN_EMAIL);
    expect(server.SENDERS.support.address).toBe(
      server.env.server.SUPPORT_INBOX,
    );
    expect(server.SENDERS.hello.address.endsWith(`@${universal.DOMAIN}`)).toBe(
      true,
    );
  });

  it("PRICES: the 03 §5.2 key set, integer minor units, the four presets (HANDOFF §5.2), access to age 3 (ADR-083)", () => {
    const { presets, ...amounts } = universal.PRICES;
    expect(Object.keys(amounts).sort()).toEqual([
      "accessAgeYears",
      "bundleMonthlyCount",
      "depositPence",
      "feePence",
      "linkTtlDays",
      "pastDueGraceDays",
      "paymentAfterStartDays",
      "satisfactionWindowDays",
      "selfServeAppMonthlyPence",
      "selfServeAppUpfrontPence",
      "trialDays",
      "trialReminderDaysBefore",
    ]);
    for (const value of Object.values(amounts))
      expect(Number.isInteger(value)).toBe(true);
    expect(Object.keys(presets).sort()).toEqual([
      "balance-after-week-1",
      "custom",
      "deposit",
      "self-serve-app",
    ]);
    expect(universal.PRICES.accessAgeYears).toBe(3);
    expect(universal.PRICES.paymentAfterStartDays).toBe(7);
    // 03 §5.4.4 — the reminder is sent five days before the trial ends, and it is the operator's cue to call.
    expect(universal.PRICES.trialReminderDaysBefore).toBe(5);
  });

  it("SCHEDULING carries the ADR-076 defaults with the LOCALE timezone", () => {
    expect(universal.SCHEDULING).toMatchObject(ADR_076);
    expect(universal.SCHEDULING.hours).toEqual({
      startLocal: "09:00",
      endLocal: "19:00",
    });
    expect(universal.SCHEDULING.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(universal.SCHEDULING.timezone).toBe(universal.LOCALE.timezone);
  });

  it("OFFER has no nanny bonus (ADR-099) and the ADR-100 first-week bounds", () => {
    expect(universal.OFFER).not.toHaveProperty("nannyBonusPence");
    expect(universal.OFFER.firstWeekMaxHours).toBe(40);
    expect(universal.OFFER.firstWeekMaxRatePence).toBe(1500);
    expect(universal.OFFER.guarantees).not.toHaveProperty("nanny-bonus");
  });

  it("FLAGS default on for the four day-one flags, BONUS_PROGRAM off (01 §3.4; HANDOFF §8.6)", () => {
    expect(server.FLAGS.KATIE).toBe(true);
    expect(server.FLAGS.INVITE_LINKS).toBe(true);
    expect(server.FLAGS.NEW_TRIALS).toBe(true);
    expect(server.FLAGS.PAYMENTS).toBe(true);
    expect(server.FLAGS.BONUS_PROGRAM).toBe(false);
    expect(universal.PUBLIC_FLAGS.BONUS_PROGRAM).toBe(false);
    expect(server.FLAGS.DEV_MODE).toBe(false);
  });

  it("AREAS_SOURCE · KATIE · UPLOADS · VETTING · LAUNCH · APP read their sources", () => {
    expect(server.AREAS_SOURCE.provider).toBe(server.env.server.AREAS_SOURCE);
    expect(server.KATIE.dailyLimitUsd).toBe(
      server.env.server.KATIE_DAILY_LIMIT_USD,
    );
    expect(Object.keys(universal.UPLOADS.buckets).sort()).toEqual([
      "development-images",
      "profile-pictures",
      "verification-documents",
    ]);
    expect(universal.VETTING.acceptedEvidence).toHaveLength(7);
    for (const type of universal.VETTING.acceptedEvidence)
      expect(universal.VETTING.providers[type]).toBe("stub-manual");
    expect(universal.LAUNCH.minVerifiedNannies).toBe(25);
    expect(universal.APP.chatAttachmentTtlDays).toBe(7);
    expect(
      evidenceTypesAgree &&
        bucketKeysAgree &&
        linkKindsAgree &&
        levelKeysAgree &&
        providerIdsAgree,
    ).toBe(true);
    expect(Object.keys(universal.VETTING.requiredChecksByLevel)).toEqual([
      ...ENUMS.verification_level,
    ]);
  });

  it("CRONS names every 01 §4f cron with a valid London schedule and a SystemJobName where it moves a stage", () => {
    expect(universal.CRONS).toHaveLength(CRON_COUNT);
    const paths = universal.CRONS.map((c) => c.path);
    expect(new Set(paths).size).toBe(CRON_COUNT);
    for (const cron of universal.CRONS) {
      expect(cron.path.startsWith("/api/cron/")).toBe(true);
      if (cron.job !== undefined)
        expect(SYSTEM_JOB_NAMES, cron.path).toContain(cron.job);
      if (cron.london.kind === "every")
        expect(cron.london.minutes).toBeGreaterThan(0);
      else {
        expect(cron.london.hour).toBeGreaterThanOrEqual(0);
        expect(cron.london.hour).toBeLessThan(24);
        expect(cron.london.minute).toBeLessThan(60);
      }
    }
    expect(
      universal.CRONS.find((c) => c.job === "usage-weekly-check")?.london,
    ).toEqual({ kind: "weekly", weekday: 1, hour: 6, minute: 0 });
    expect(
      universal.CRONS.find((c) => c.job === "payment-due-sweep")?.london,
    ).toEqual({ kind: "daily", hour: 7, minute: 0 });
    expect(paths).not.toContain("/api/cron/release-payouts");
  });
});

// 07 §6.1's "what is retained and why" is asserted in `config.legal.test.ts` now, not here: ADR-179 moved the
// list to `LEGAL.erasureRetains`, beside the jurisdiction it is part of, and its tests moved with it.
