// The day-one scanner (ADR-106; 07 §5.3 rule 3): no third-party scan. It accepts exactly what `config/uploads.ts`
// allows — the bucket's MIME list and the unconditional size cap — and reads no bytes. Anything else is the
// 07 §5.3 rule 4 envelope reason (`invalid_type` · `file_too_large`); the upload action deletes the object.
import { UPLOADS } from "@/modules/config";
import type { UploadScanner } from "./types";
import { err } from "../lib/err";
import { ok } from "../lib/ok";

const SCANNER_ID = "stub";

export const stubUploadScanner: UploadScanner = Object.freeze({
  id: SCANNER_ID,
  scan: async (input) => {
    const allowed: ReadonlyArray<string> =
      UPLOADS.buckets[input.bucket].mimeTypes;
    if (
      !allowed.includes(input.mime) ||
      !Number.isFinite(input.bytes) ||
      input.bytes <= 0
    ) {
      return err("VALIDATION", "This file type is not accepted", {
        reason: "invalid_type",
      });
    }
    if (input.bytes > UPLOADS.maxBytes) {
      return err("VALIDATION", "This file is too large", {
        reason: "file_too_large",
      });
    }
    return ok({ verdict: "clean" as const, scanner: SCANNER_ID });
  },
});
