// 02 §8 / 07 §5.3 rule 2 — `<user_id>/<section>/<uuid>.<ext>`, every segment from a server-side value: the
// session's id, one of the four section names `0015` admits, a fresh uuid per attempt (I-V6) and an extension
// from the SNIFFED type. Nothing from the file name reaches the path.
import type { UserId } from "@/modules/shared-types";
import type { EvidenceObjectSection } from "../types";

const EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
});

export function evidenceObjectPath(
  nannyId: UserId,
  section: EvidenceObjectSection,
  mime: string,
): string {
  const extension = EXTENSION[mime] ?? "bin";
  // a plain uuid, not a branded id: an object name is a path segment, never an entity (I-V6: new per attempt)
  return `${nannyId}/${section}/${crypto.randomUUID()}.${extension}`;
}
