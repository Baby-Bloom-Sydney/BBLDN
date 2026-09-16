// 03 §11 row 3 — the shared provider suite, in the part ADR-117 Tier A leaves reachable. This unit built the
// connector only, so the cases here are the ones that need no evidence, no storage and no provider call:
// registry agreement, the open/refuse behaviour of `getProvider`, and the fail-closed store.
import { describe, expect, it } from "vitest";
import { VETTING } from "@/modules/config";
import type {
  Evidence,
  EvidenceType,
  SubmissionId,
} from "@/modules/shared-types";
import {
  configureVettingStore,
  getProvider,
  listProviders,
  stubManualProvider,
  unconfiguredVettingStore,
} from "../index";

const acceptedTypes = VETTING.acceptedEvidence as ReadonlyArray<EvidenceType>;

const evidenceOf = (type: EvidenceType): Evidence => ({
  id: "evidence-1" as Evidence["id"],
  nannyId: "nanny-1" as Evidence["nannyId"],
  type,
  documents: [],
  declared: {},
  consent: {},
  submittedAt: "2026-09-16T00:00:00.000Z" as Evidence["submittedAt"],
});

describe("vetting-providers — `supports` agrees with the registry (03 §11 row 3)", () => {
  it.each(acceptedTypes)(
    "stub-manual supports %s, the type config binds it to",
    (type) => {
      expect(VETTING.providers[type]).toBe("stub-manual");
      expect(stubManualProvider.supports(type)).toBe(true);
    },
  );

  it("does not support an evidence type outside the accepted set", () => {
    expect(
      stubManualProvider.supports("passport-photocopy" as EvidenceType),
    ).toBe(false);
  });
});

describe("vetting-providers — the binding is config, never an import (05 §3 rule 1)", () => {
  it.each(acceptedTypes)(
    "getProvider(%s) returns the bound provider",
    (type) => {
      const provider = getProvider(type);
      expect(provider.ok && provider.value.id).toBe("stub-manual");
    },
  );

  it("lists what is bound, and says it is manual", () => {
    const listed = listProviders();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.manual).toBe(true);
    expect(listed[0]?.supports).toEqual([...acceptedTypes]);
  });
});

describe("vetting-providers — ADR-117 Tier A: no evidence path exists yet", () => {
  it("the submission store refuses rather than half-recording a check", async () => {
    configureVettingStore(unconfiguredVettingStore);
    const submitted = await stubManualProvider.submit(
      evidenceOf("identity-document"),
    );
    expect(submitted.ok).toBe(false);
    expect(!submitted.ok && submitted.error.details?.reason).toBe(
      "vetting-store-not-configured",
    );
  });

  it("refuses evidence outside the accepted set before it reaches any store", async () => {
    const submitted = await stubManualProvider.submit(
      evidenceOf("passport-photocopy" as EvidenceType),
    );
    expect(!submitted.ok && submitted.error.details?.reason).toBe(
      "unsupported-evidence",
    );
  });

  it("extracts nothing and reads no document (03 §4.4)", async () => {
    const extracted = await stubManualProvider.extract(
      evidenceOf("dbs-certificate"),
    );
    expect(extracted.ok && extracted.value).toEqual({ consistency: [] });
  });

  it("reports the day-one expiry policy without a provider call", async () => {
    const expiry = await stubManualProvider.expiry("sub-1" as SubmissionId);
    expect(expiry.ok && expiry.value).toEqual({
      expiresAt: null,
      renewable: false,
      source: "policy",
    });
  });
});
