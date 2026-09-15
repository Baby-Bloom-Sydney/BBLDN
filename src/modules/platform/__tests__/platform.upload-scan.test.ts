// The upload-scan stub (07 §5.3 rule 3; ADR-106): accepts only the `config/uploads.ts` MIME lists and size cap,
// reads no bytes, calls no network; a real scanner drops in behind the same interface.
import { describe, expect, it } from "vitest";
import { UPLOADS } from "@/modules/config";
import {
  configureUploadScanner,
  stubUploadScanner,
  uploadScanner,
} from "@/modules/platform";
import type { UploadScanner } from "@/modules/platform";

describe("platform/upload-scan — stub (the day-one scanner)", () => {
  it("is the default scanner and says so", () => {
    expect(uploadScanner.id).toBe("stub");
    expect(stubUploadScanner.id).toBe("stub");
  });

  it("accepts an allowed MIME under the cap as clean, per bucket", async () => {
    const image = await stubUploadScanner.scan({
      bucket: "profile-pictures",
      mime: "image/jpeg",
      bytes: 1024,
    });
    expect(image).toEqual({
      ok: true,
      value: { verdict: "clean", scanner: "stub" },
    });
    const pdf = await stubUploadScanner.scan({
      bucket: "verification-documents",
      mime: "application/pdf",
      bytes: UPLOADS.maxBytes,
    });
    expect(pdf.ok).toBe(true);
  });

  it("rejects a MIME the bucket does not allow as VALIDATION { reason: 'invalid_type' }", async () => {
    const pdfInPictures = await stubUploadScanner.scan({
      bucket: "profile-pictures",
      mime: "application/pdf",
      bytes: 10,
    });
    expect(pdfInPictures.ok).toBe(false);
    if (!pdfInPictures.ok) {
      expect(pdfInPictures.error.code).toBe("VALIDATION");
      expect(pdfInPictures.error.details).toEqual({ reason: "invalid_type" });
    }
    const exe = await stubUploadScanner.scan({
      bucket: "development-images",
      mime: "application/x-msdownload",
      bytes: 10,
    });
    expect(exe.ok).toBe(false);
    const empty = await stubUploadScanner.scan({
      bucket: "development-images",
      mime: "image/png",
      bytes: 0,
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok)
      expect(empty.error.details).toEqual({ reason: "invalid_type" });
  });

  it("rejects an object over the unconditional cap as VALIDATION { reason: 'file_too_large' }", async () => {
    const big = await stubUploadScanner.scan({
      bucket: "development-images",
      mime: "image/png",
      bytes: UPLOADS.maxBytes + 1,
    });
    expect(big.ok).toBe(false);
    if (!big.ok)
      expect(big.error.details).toEqual({ reason: "file_too_large" });
  });

  it("never reads the content it is handed", async () => {
    const content = new Uint8Array([0xff, 0xd8, 0xff]);
    const spied = new Proxy(content, {
      get: (target, prop) => {
        if (
          prop === "length" ||
          prop === "byteLength" ||
          typeof prop === "symbol"
        )
          return Reflect.get(target, prop);
        throw new Error(`stub read content.${String(prop)}`);
      },
    });
    const result = await stubUploadScanner.scan({
      bucket: "development-images",
      mime: "image/jpeg",
      bytes: 3,
      content: spied,
    });
    expect(result.ok).toBe(true);
  });

  it("configureUploadScanner swaps the implementation behind the same interface", async () => {
    const fake: UploadScanner = {
      id: "fake-clamav",
      scan: async () => ({
        ok: true,
        value: { verdict: "infected", scanner: "fake-clamav" },
      }),
    };
    configureUploadScanner(fake);
    const result = await uploadScanner.scan({
      bucket: "development-images",
      mime: "image/png",
      bytes: 1,
    });
    expect(result).toEqual({
      ok: true,
      value: { verdict: "infected", scanner: "fake-clamav" },
    });
    configureUploadScanner(stubUploadScanner);
    expect(uploadScanner.id).toBe("stub");
  });
});
