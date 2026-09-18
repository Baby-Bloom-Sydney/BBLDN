// 03 §4.2: `DocumentRef` carries a signed URL "signed by the caller via auth.data.signUrl; providers never touch
// Storage". The TTL is the bucket's own (`SECURITY.signedUrlTtlSeconds.verification`, 1 h — 07 §10.1).
import { auth } from "@/modules/auth";
import { SECURITY } from "@/modules/config";
import { ok } from "@/modules/platform";
import type { DocumentRef, Instant, Result } from "@/modules/shared-types";
import type { EvidenceRef, VerificationErrorDetails } from "../types";

export async function signEvidence(
  ref: EvidenceRef,
): Promise<Result<DocumentRef, VerificationErrorDetails>> {
  const ttl = SECURITY.signedUrlTtlSeconds.verification;
  const signed = await auth.data.signUrl(ref, ttl);
  if (!signed.ok) return signed as Result<never, VerificationErrorDetails>;
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString() as Instant;
  return ok({
    bucket: ref.bucket,
    path: ref.path,
    signedUrl: signed.value,
    expiresAt,
  });
}
