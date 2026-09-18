// REVIEW-3 H-1 — **the re-encoder's outage was indistinguishable from a bad photo, and silent.**
//
// `re-encode-image.ts` wrapped the whole `sharp` road — the dynamic `import()`, the decode, the rotate, the
// resize, the encode — in one `catch { return null }`, and its header argued only the decode case ("a file
// `sharp` cannot decode … is `null` — refused as unreadable"). Every other failure folded into the same
// `null`: the native binding missing after a deploy, an OOM, a `toBuffer` fault. `prepare()` in
// `upload-evidence.ts` turns `null` into "We couldn't read that image. Try another photo." So a runtime where
// `sharp` will not load refuses **every** image in the whole wizard — identity document, selfie, DBS
// certificate, right-to-work document — with a sentence that blames the nanny's file, **no log line, no alert,
// and no way for anyone on call to tell it from one corrupt upload**. That is REVIEW-2's H-8 shape exactly
// ("a refusal invisible on a live screen"), on the one road every nanny must pass to reach level 1.
//
// It is not a hypothetical runtime: `sharp` is native, it is carried by `serverComponentsExternalPackages`
// (`next.config.mjs:10`) and loaded through a `webpackIgnore` dynamic import precisely because the bundler
// cannot follow it — which is the arrangement in which a missing platform binary shows up at call time rather
// than at build time.
//
// The fix keeps the argued behaviour and separates the two causes. An unreadable file is still `null` and
// still "try another photo" — plus a `warn` so a flood is visible. A loader failure is `"encoder-unavailable"`,
// which `prepare()` maps to the **same** `PROVIDER_ERROR` / `storage_failure` arm the scanner's `unavailable`
// verdict already uses eight lines below it, and which alerts. No new vocabulary, no new user state.
//
// RED first: before the fix both cases below returned `null`, the upload answered `invalid_type`, and `errors`
// was empty.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { configureAuth, stubAuth } from "@/modules/auth";
import {
  configureLog,
  configureUploadScanner,
  stubUploadScanner,
} from "@/modules/platform";
import type { Email, UserId } from "@/modules/shared-types";
import { tinyJpeg } from "./fixtures/tiny-jpeg";

const NANNY = "11111111-1111-4111-8111-111111111111" as UserId;
let JPEG: Uint8Array;

beforeAll(async () => {
  // Built **before** anything mocks `sharp` — the fixture needs the real one to make a real JPEG.
  JPEG = await tinyJpeg();
});

beforeEach(() => {
  configureAuth(
    stubAuth({
      users: [
        { id: NANNY, email: "amara@example.test" as Email, role: "nanny" },
      ],
      signedInUserId: NANNY,
    }),
  );
  configureUploadScanner(stubUploadScanner);
});

/** Captures the JSON log lines a call emits, the way `payments.screens` does. */
async function withCapturedErrors<T>(run: () => Promise<T>): Promise<{
  readonly value: T;
  readonly lines: ReadonlyArray<Record<string, unknown>>;
}> {
  const lines: Array<Record<string, unknown>> = [];
  const out = vi.spyOn(console, "error").mockImplementation((line) => {
    lines.push(JSON.parse(String(line)) as Record<string, unknown>);
    return undefined;
  });
  configureLog({ format: "json", minLevel: "info" });
  try {
    return { value: await run(), lines };
  } finally {
    out.mockRestore();
  }
}

describe("the image re-encoder's own outage (REVIEW-3 H-1)", () => {
  it("a file sharp cannot decode is still `null` — the argued case is unchanged", async () => {
    const { reEncodeImage } = await import("../lib/re-encode-image");
    // JPEG magic bytes, then nothing sharp can read.
    const truncated = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a,
    ]);
    expect(await reEncodeImage(truncated)).toBe(null);
  });

  it("a re-encoder that will not load is `encoder-unavailable`, not `null`, and it alerts", async () => {
    vi.resetModules();
    vi.doMock("sharp", () => {
      throw new Error("Could not load the sharp runtime for this platform");
    });
    try {
      // The fresh registry's own log, or `configureLog` above would have configured a module instance
      // `re-encode-image` no longer holds — and the assertion would pass or fail for the wrong reason.
      const freshPlatform = await import("@/modules/platform");
      freshPlatform.configureLog({ format: "json", minLevel: "info" });
      const { reEncodeImage } = await import("../lib/re-encode-image");
      const { value, lines } = await withCapturedErrors(() =>
        reEncodeImage(JPEG),
      );
      expect(value).toBe("encoder-unavailable");
      expect(lines.map((row) => row.alert)).toContain("ALERT_PROVIDER_DOWN");
    } finally {
      vi.doUnmock("sharp");
      vi.resetModules();
    }
  });

  it("the whole wizard's upload then refuses as an outage, never as the nanny's bad photo", async () => {
    vi.resetModules();
    vi.doMock("sharp", () => {
      throw new Error("Could not load the sharp runtime for this platform");
    });
    try {
      // `resetModules` gives every module a fresh registry, so the session and the scanner are configured
      // again **through the fresh instances** — otherwise the action refuses as UNAUTHENTICATED and this
      // case would assert nothing about the encoder at all.
      const freshAuth = await import("@/modules/auth");
      freshAuth.configureAuth(
        freshAuth.stubAuth({
          users: [
            { id: NANNY, email: "amara@example.test" as Email, role: "nanny" },
          ],
          signedInUserId: NANNY,
        }),
      );
      const freshPlatform = await import("@/modules/platform");
      freshPlatform.configureUploadScanner(freshPlatform.stubUploadScanner);
      const { uploadEvidence } = await import("../lib/upload-evidence");
      const { value: result } = await withCapturedErrors(() =>
        uploadEvidence(NANNY, "identity-document", { bytes: JPEG }),
      );
      expect(result.ok).toBe(false);
      // The scanner-outage arm, reused: an outage is an outage whichever provider is down.
      expect(!result.ok && result.error.code).toBe("PROVIDER_ERROR");
      expect(!result.ok && result.error.details?.reason).toBe(
        "storage_failure",
      );
      // And never the sentence that blames her file.
      expect(!result.ok && result.error.message).not.toMatch(/another photo/iu);
    } finally {
      vi.doUnmock("sharp");
      vi.resetModules();
    }
  });
});
