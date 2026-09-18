// The pure pieces of the wizard (04 §6.3 S-N-03…S-N-09; `03.21` resume): the step list, "first incomplete step"
// from a status, the MIME sniff from magic bytes, the object path from server-side values (07 §5.3 rule 2), and
// the section ↔ evidence-type joins (ADR-153). Written RED first.
import { describe, expect, it } from "vitest";
import { VETTING } from "@/modules/config";
import type { UserId } from "@/modules/shared-types";
import {
  WIZARD_STEPS,
  evidenceObjectPath,
  firstIncompleteStep,
  sniffMime,
} from "../index";
import type { VerificationState } from "../types";

const NANNY = "11111111-1111-4111-8111-111111111111" as UserId;

const stateOf = (
  over: Partial<Record<string, string>> = {},
): VerificationState => ({
  nannyId: NANNY,
  level: "L0_SIGNED_UP",
  suspended: false,
  sections: [
    { section: "contact", status: (over.contact ?? "not_started") as never },
    {
      section: "identity",
      status: (over.identity ?? "not_started") as never,
      attempts: 0,
    },
    { section: "dbs", status: (over.dbs ?? "not_started") as never },
    { section: "right-to-work", status: (over.rtw ?? "not_started") as never },
  ],
});

describe("WIZARD_STEPS — S-N-03…S-N-08 in order", () => {
  it("is the six steps of 04 §2.3, step 0 the interstitial and step 5 processing", () => {
    expect(WIZARD_STEPS.map((step) => step.screen)).toEqual([
      "S-N-03",
      "S-N-04",
      "S-N-05",
      "S-N-06",
      "S-N-07",
      "S-N-08",
    ]);
    expect(WIZARD_STEPS[1]?.section).toBe("contact");
    expect(WIZARD_STEPS[4]?.section).toBe("right-to-work");
  });
});

describe("firstIncompleteStep — the wizard reopens where she left off (03.21)", () => {
  it("a fresh account starts at the interstitial; after contact the identity step", () => {
    expect(firstIncompleteStep(null)).toBe(0);
    expect(firstIncompleteStep(stateOf())).toBe(0);
    expect(firstIncompleteStep(stateOf({ contact: "verified" }))).toBe(2);
  });

  it("a rejected section is the step to retry; a pending or in-review one is skipped", () => {
    expect(
      firstIncompleteStep(
        stateOf({ contact: "verified", identity: "rejected" }),
      ),
    ).toBe(2);
    expect(
      firstIncompleteStep(stateOf({ contact: "verified", identity: "review" })),
    ).toBe(3);
    expect(
      firstIncompleteStep(
        stateOf({ contact: "verified", identity: "review", dbs: "pending" }),
      ),
    ).toBe(4);
  });

  it("everything submitted with something still pending → processing; everything settled → the status page", () => {
    expect(
      firstIncompleteStep(
        stateOf({
          contact: "verified",
          identity: "pending",
          dbs: "pending",
          rtw: "pending",
        }),
      ),
    ).toBe(5);
    expect(
      firstIncompleteStep(
        stateOf({
          contact: "verified",
          identity: "review",
          dbs: "review",
          rtw: "verified",
        }),
      ),
    ).toBe("status");
  });
});

describe("sniffMime — the type comes from the bytes, never the file name (07 §4.16)", () => {
  it.each([
    [[0xff, 0xd8, 0xff, 0xe0], "image/jpeg"],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
    [[0x25, 0x50, 0x44, 0x46, 0x2d], "application/pdf"],
  ])("recognises %j as %s", (bytes, mime) => {
    expect(sniffMime(new Uint8Array(bytes))).toBe(mime);
  });

  it("recognises WebP (RIFF….WEBP) and HEIC (ftypheic) by their boxes", () => {
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffMime(webp)).toBe("image/webp");
    const heic = new Uint8Array(12);
    heic.set([0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 4);
    expect(sniffMime(heic)).toBe("image/heic");
  });

  it("answers null for anything else, including a renamed script", () => {
    expect(
      sniffMime(new TextEncoder().encode("<script>alert(1)</script>")),
    ).toBeNull();
    expect(sniffMime(new Uint8Array(0))).toBeNull();
  });
});

describe("evidenceObjectPath — <uid>/<section>/<uuid>.<ext> from server-side values only (07 §5.3 rule 2)", () => {
  it("builds the four section prefixes 0015 admits and picks the extension from the sniffed type", () => {
    const path = evidenceObjectPath(NANNY, "identity-selfie", "image/jpeg");
    expect(path).toMatch(
      new RegExp(`^${NANNY}/identity-selfie/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(
      evidenceObjectPath(NANNY, "dbs-certificate", "application/pdf"),
    ).toMatch(/\.pdf$/);
    expect(evidenceObjectPath(NANNY, "rtw-document", "image/png")).toMatch(
      /\.png$/,
    );
  });
});

describe("the ADR-153 joins live in config", () => {
  it("every rtw evidence kind maps to a right-to-work evidence type, and none of them gates a level", () => {
    const types = Object.values(VETTING.rightToWorkEvidence);
    expect(types).toEqual([
      "right-to-work-passport",
      "right-to-work-share-code",
      "right-to-work-document",
    ]);
    for (const list of Object.values(VETTING.requiredChecksByLevel))
      for (const type of types) expect(list).not.toContain(type);
  });
});
