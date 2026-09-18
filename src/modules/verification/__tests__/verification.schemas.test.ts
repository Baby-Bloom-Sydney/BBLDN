// The four boundary schemas (01 §4a: validated once, at the boundary) in the words the screens use. RED first.
import { describe, expect, it } from "vitest";
import { LOCALE } from "@/modules/config";
import {
  contactSchema,
  dbsSchema,
  identitySchema,
  rightToWorkSchema,
} from "../index";

const file = (bytes: number, name = "a.jpg", type = "image/jpeg") =>
  new File([new Uint8Array(bytes)], name, { type });

describe("contactSchema (S-N-04)", () => {
  it("accepts a UK mobile in either form and normalises it; requires the area", () => {
    const parsed = contactSchema.safeParse({
      mobile: "07700 900123",
      district: "SW4",
      area: "Clapham",
    });
    expect(parsed.success && parsed.data.mobile).toBe(
      `${LOCALE.phonePrefix}7700900123`,
    );
    expect(
      contactSchema.safeParse({ mobile: "07700900123", district: "", area: "" })
        .success,
    ).toBe(false);
    expect(
      contactSchema.safeParse({
        mobile: "0161 000 0000",
        district: "SW4",
        area: "Clapham",
      }).success,
    ).toBe(false);
  });
});

describe("identitySchema (S-N-05)", () => {
  const good = {
    idType: "passport",
    document: file(10),
    selfie: file(10, "s.jpg"),
    surname: "Okafor",
    givenNames: "Amara",
    dateOfBirth: "1990-04-12",
    consent: "on",
  };

  it("accepts the three UK id types of config and needs both files, the declared names, a DOB and the tick", () => {
    expect(identitySchema.safeParse(good).success).toBe(true);
    expect(identitySchema.safeParse({ ...good, idType: "wwcc" }).success).toBe(
      false,
    );
    expect(
      identitySchema.safeParse({ ...good, consent: undefined }).success,
    ).toBe(false);
    expect(
      identitySchema.safeParse({ ...good, selfie: undefined }).success,
    ).toBe(false);
    expect(
      identitySchema.safeParse({ ...good, dateOfBirth: "12/04/1990" }).success,
    ).toBe(false);
  });

  it("refuses a date of birth that makes her under 18 or in the future", () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    expect(
      identitySchema.safeParse({
        ...good,
        dateOfBirth: nextYear.toISOString().slice(0, 10),
      }).success,
    ).toBe(false);
    const sixteen = new Date();
    sixteen.setFullYear(sixteen.getFullYear() - 16);
    expect(
      identitySchema.safeParse({
        ...good,
        dateOfBirth: sixteen.toISOString().slice(0, 10),
      }).success,
    ).toBe(false);
  });
});

describe("dbsSchema (S-N-06)", () => {
  it("needs the certificate, a 12-digit number, an issue date not in the future, and the Update Service tick", () => {
    const good = {
      certificate: file(10, "c.pdf", "application/pdf"),
      certificateNumber: "001234 567890",
      issueDate: "2025-06-01",
      updateServiceConsent: "on",
    };
    const parsed = dbsSchema.safeParse(good);
    expect(parsed.success && parsed.data.certificateNumber).toBe(
      "001234567890",
    );
    expect(
      dbsSchema.safeParse({ ...good, certificateNumber: "12345" }).success,
    ).toBe(false);
    expect(
      dbsSchema.safeParse({ ...good, issueDate: "2999-01-01" }).success,
    ).toBe(false);
    expect(
      dbsSchema.safeParse({ ...good, updateServiceConsent: undefined }).success,
    ).toBe(false);
  });
});

describe("rightToWorkSchema (S-N-07) — one of three kinds (ADR-153)", () => {
  it("a British or Irish passport needs the file; a share code needs the code and the DOB; a document needs the file", () => {
    expect(
      rightToWorkSchema.safeParse({
        kind: "british_irish_passport",
        document: file(10),
      }).success,
    ).toBe(true);
    const share = rightToWorkSchema.safeParse({
      kind: "share_code",
      shareCode: "w1a 2b3 4c5",
      dateOfBirth: "1990-04-12",
    });
    expect(
      share.success && share.data.kind === "share_code" && share.data.shareCode,
    ).toBe("W1A2B34C5");
    expect(
      rightToWorkSchema.safeParse({
        kind: "share_code",
        shareCode: "W1A",
        dateOfBirth: "1990-04-12",
      }).success,
    ).toBe(false);
    expect(
      rightToWorkSchema.safeParse({
        kind: "immigration_document",
        document: file(10),
      }).success,
    ).toBe(true);
    expect(rightToWorkSchema.safeParse({ kind: "visa" }).success).toBe(false);
  });
});
