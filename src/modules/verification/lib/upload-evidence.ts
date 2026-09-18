// The one upload road (07 §5.3 rule 3; ADR-155): session → path from server-side values → MIME sniffed from the
// bytes → size cap → image re-encoded (EXIF gone) → scan → object with its metadata → the ref. The scan runs
// BEFORE the object is written, so an infected file is never at rest; `verification-documents` fails closed
// when the scanner is unavailable (rule 3: "fail closed for verification-documents"). The ref carries bucket +
// path and never a URL (I-V7); the caller signs it for the provider (03 §4.2).
import { auth } from "@/modules/auth";
import { UPLOADS } from "@/modules/config";
import { err, log, ok, uploadScanner } from "@/modules/platform";
import type { Result, UserId } from "@/modules/shared-types";
import type {
  EvidenceObjectSection,
  EvidenceRef,
  UploadedFile,
  VerificationErrorDetails,
} from "../types";
import { evidenceObjectPath } from "./evidence-object-path";
import { reEncodeImage } from "./re-encode-image";
import { sniffMime } from "./sniff-mime";

const BUCKET = "verification-documents" as const;
const ACCEPTED: ReadonlyArray<string> = UPLOADS.buckets[BUCKET].mimeTypes;

const refuse = (reason: VerificationErrorDetails["reason"], message: string) =>
  err<VerificationErrorDetails>("VALIDATION", message, { reason });

async function prepare(
  file: UploadedFile,
): Promise<
  Result<
    { readonly bytes: Uint8Array; readonly mime: string },
    VerificationErrorDetails
  >
> {
  if (file.bytes.byteLength === 0)
    return refuse("missing_field", "Choose a file to upload.");
  if (file.bytes.byteLength > UPLOADS.maxBytes)
    return refuse("file_too_large", "That file is too large.");
  const mime = sniffMime(file.bytes);
  if (mime === null || !ACCEPTED.includes(mime))
    return refuse(
      "invalid_type",
      "Please upload a JPEG, PNG, WebP, HEIC or PDF.",
    );
  if (mime === "application/pdf") return ok({ bytes: file.bytes, mime });
  const image = await reEncodeImage(file.bytes);
  if (image === null)
    return refuse(
      "invalid_type",
      "We couldn't read that image. Try another photo.",
    );
  if (image.bytes.byteLength > UPLOADS.maxBytes)
    return refuse("file_too_large", "That file is too large.");
  return ok(image);
}

export async function uploadEvidence(
  nannyId: UserId,
  section: EvidenceObjectSection,
  file: UploadedFile,
): Promise<Result<EvidenceRef, VerificationErrorDetails>> {
  const user = await auth.getCurrentUserId();
  if (!user.ok || user.value === null)
    return err("UNAUTHENTICATED", "Sign in to continue.", {
      reason: "not_authenticated",
    });
  if (user.value !== nannyId)
    return err("FORBIDDEN", "That isn't yours to change.", {
      reason: "permission_denied",
    });
  const prepared = await prepare(file);
  if (!prepared.ok) return prepared;
  const path = evidenceObjectPath(nannyId, section, prepared.value.mime);
  const scanned = await uploadScanner.scan({
    bucket: BUCKET,
    mime: prepared.value.mime,
    bytes: prepared.value.bytes.byteLength,
    objectPath: path,
    content: prepared.value.bytes,
  });
  if (!scanned.ok) return scanned as Result<never, VerificationErrorDetails>;
  if (scanned.value.verdict === "infected") {
    log.warn("upload refused by the scanner", {
      module: "verification",
      action: "uploadEvidence",
      alert: "ALERT_UPLOAD_MALWARE",
      scanner: scanned.value.scanner,
    });
    return refuse("invalid_type", "That file can't be accepted.");
  }
  if (scanned.value.verdict === "unavailable")
    return err(
      "PROVIDER_ERROR",
      "We couldn't check that file just now. Try again in a moment.",
      {
        reason: "storage_failure",
      },
    );
  const ref: EvidenceRef = { bucket: BUCKET, path };
  const written = await auth.data.putObject(ref, prepared.value.bytes, {
    contentType: prepared.value.mime,
    metadata: {
      uploaded_by: nannyId,
      entity_kind: "verification",
      entity_id: nannyId,
      scan: "clean",
    },
  });
  if (!written.ok)
    return err("INTERNAL", "We couldn't save that file just now.", {
      reason: "storage_failure",
    });
  return ok(ref);
}
