// ── REVIEW-3 M-9 / R-5 — the upload promise has to be one the platform can keep ──────────────────────────
//
// `FileField` renders "up to N MB" from the wizard's options, `upload-evidence.ts` enforces N server-side, and
// until now N was `UPLOADS.maxBytes` — **10 MB**, which is 07 §5.3 rule 3's *bucket* ceiling and the buckets'
// own `file_size_limit`. It is not what the deployed platform accepts: a Vercel serverless function's request
// body is capped near 4.5 MB, and a server action is a POST to a serverless function. Above that the platform
// refuses the request before any of this code runs, so the promise on the screen was one nothing could keep and
// nothing measured — 05's suites all run in-process, where no transport exists to say no.
//
// So the wizard's number is now `UPLOADS.maxUploadBytes`, which is the transport's limit, and the copy, the
// schema and the server-side cap all read the same constant. RED first.
import { describe, expect, it } from "vitest";
import { UPLOADS } from "@/modules/config";
import { fileField } from "../lib/file-field";
import { wizardOptions } from "../lib/wizard-options";

/** Vercel's documented serverless request-body cap. `maxUploadBytes` has to fit under it with room for fields. */
const VERCEL_BODY_CAP_BYTES = 4.5 * 1024 * 1024;

/** A `File`-shaped value of a given size, judged by shape the way `fileField` judges it. */
const fileOf = (bytes: number): unknown => ({
  size: bytes,
  arrayBuffer: async () => new ArrayBuffer(0),
});

describe("the upload cap is the platform's, not the bucket's (REVIEW-3 M-9)", () => {
  it("names a transport cap in config that fits inside a serverless request body", () => {
    expect(UPLOADS.maxUploadBytes).toBeGreaterThan(0);
    expect(UPLOADS.maxUploadBytes).toBeLessThan(VERCEL_BODY_CAP_BYTES);
  });

  it("keeps the bucket ceiling separate and no smaller — storage may hold more than one POST can carry", () => {
    expect(UPLOADS.maxBytes).toBeGreaterThanOrEqual(UPLOADS.maxUploadBytes);
  });

  it("refuses an over-cap file at the schema boundary, before any byte is read", () => {
    const schema = fileField("document");

    expect(schema.safeParse(fileOf(UPLOADS.maxUploadBytes)).success).toBe(true);
    expect(schema.safeParse(fileOf(UPLOADS.maxUploadBytes + 1)).success).toBe(
      false,
    );
  });

  it("puts the same number on the screen — the wizard's copy cannot promise more than the boundary takes", () => {
    expect(wizardOptions().maxBytes).toBe(UPLOADS.maxUploadBytes);
  });
});
