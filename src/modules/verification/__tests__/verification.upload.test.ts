// The one upload road (07 §5.3 rule 3; ADR-155): session → path from server-side values → MIME sniffed from the
// bytes → size cap → scan → object → the ref. A failed scan or a refused write stores nothing; an image is
// re-encoded so no EXIF survives. Over the stub auth driver's object map. RED first.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, configureAuth, stubAuth } from "@/modules/auth";
import { UPLOADS } from "@/modules/config";
import { configureUploadScanner, stubUploadScanner } from "@/modules/platform";
import type { Email, UserId } from "@/modules/shared-types";
import { uploadEvidence } from "../index";
import { removeEvidenceObjects } from "../lib/remove-evidence-objects";
import { tinyJpeg } from "./fixtures/tiny-jpeg";

const NANNY = "11111111-1111-4111-8111-111111111111" as UserId;
let JPEG: Uint8Array;

beforeAll(async () => {
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

describe("uploadEvidence", () => {
  it("stores a PDF under <uid>/<section>/<uuid>.pdf and answers the ref — bucket + path, never a URL (I-V7)", async () => {
    const result = await uploadEvidence(NANNY, "dbs-certificate", {
      bytes: new TextEncoder().encode("%PDF-1.4 x"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bucket).toBe("verification-documents");
    expect(result.value.path).toMatch(
      new RegExp(`^${NANNY}/dbs-certificate/[0-9a-f-]{36}\\.pdf$`),
    );
    expect(JSON.stringify(result.value)).not.toMatch(/https?:/);
    const signed = await auth.data.signUrl(result.value, 60);
    expect(signed.ok).toBe(true);
  });

  it("refuses bytes whose sniffed type is not in the bucket's list, whatever the caller claims (07 §4.16)", async () => {
    const result = await uploadEvidence(NANNY, "identity-document", {
      bytes: new TextEncoder().encode("MZ\x90\x00 not an image"),
      contentType: "image/jpeg",
      fileName: "passport.jpg",
    });
    expect(!result.ok && result.error.details?.reason).toBe("invalid_type");
  });

  it("refuses a file over the cap before scanning or storing", async () => {
    const big = new Uint8Array(UPLOADS.maxBytes + 1);
    big.set(JPEG, 0);
    const result = await uploadEvidence(NANNY, "identity-document", {
      bytes: big,
    });
    expect(!result.ok && result.error.details?.reason).toBe("file_too_large");
  });

  it("fails closed when the scanner is unavailable (verification-documents: storage_failure, nothing kept)", async () => {
    configureUploadScanner({
      id: "down",
      scan: async () => ({
        ok: true,
        value: { verdict: "unavailable", scanner: "down" },
      }),
    });
    const result = await uploadEvidence(NANNY, "identity-document", {
      bytes: JPEG,
    });
    expect(!result.ok && result.error.details?.reason).toBe("storage_failure");
  });

  it("deletes the object and answers invalid_type when the scanner says infected", async () => {
    configureUploadScanner({
      id: "strict",
      scan: async () => ({
        ok: true,
        value: { verdict: "infected", scanner: "strict" },
      }),
    });
    const result = await uploadEvidence(NANNY, "identity-document", {
      bytes: JPEG,
    });
    expect(!result.ok && result.error.details?.reason).toBe("invalid_type");
  });

  it("removeEvidenceObjects never hands the service-scope delete a path outside the nanny's own prefix (security pass M2)", async () => {
    // Through the connector only (01 §2.3: no deep import of `auth`'s internals): the stub driver keeps an object
    // map, so both objects are put first, the helper is asked to remove both, and what is still there afterwards
    // is read back through the port — the foreign object survives, the nanny's own one is gone.
    const OTHER = "22222222-2222-4222-8222-222222222222";
    const foreign = {
      bucket: "verification-documents" as const,
      path: `${OTHER}/identity-document/a.jpg`,
    };
    const own = {
      bucket: "verification-documents" as const,
      path: `${NANNY}/identity-document/b.jpg`,
    };
    const opts = { contentType: "image/jpeg" };
    expect((await auth.data.putObject(foreign, JPEG, opts)).ok).toBe(true);
    expect((await auth.data.putObject(own, JPEG, opts)).ok).toBe(true);
    await removeEvidenceObjects(NANNY, [foreign, own]);
    // still there: the helper refused it before the port
    expect((await auth.data.removeObject(foreign)).ok).toBe(true);
    // already gone: the helper removed it
    expect((await auth.data.removeObject(own)).ok).toBe(false);
  });
});
