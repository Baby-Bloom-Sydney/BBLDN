// 01 §3.1 / 07 §5.3 rule 5 — bucket MIME lists + caps for the three buckets of 01 §6.1 (ADR-061, ADR-106:
// image / PDF only, MIME-sniffed, size-capped; scanner stubbed until Phase 2). Kept apart from security.ts
// (see README): security.ts references it as the upload control.
import type { BucketKey } from "./types";

const IMAGE_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const);
const MEGABYTE = 1024 * 1024;

export const UPLOADS = Object.freeze({
  maxBytes: 10 * MEGABYTE, // 10 MB unconditional (07 §5.3 rule 3)
  maxImageEdgePx: 2000, // images re-encoded, EXIF-stripped, 2000 px max edge (07 §5.3 rule 3)
  scanPendingMaxHours: 24, // quarantine-and-retry objects older than this are deleted by retention-sweep
  buckets: Object.freeze({
    "profile-pictures": Object.freeze({ mimeTypes: IMAGE_MIME_TYPES }),
    "verification-documents": Object.freeze({
      mimeTypes: Object.freeze([
        ...IMAGE_MIME_TYPES,
        "application/pdf",
      ] as const),
    }),
    "development-images": Object.freeze({ mimeTypes: IMAGE_MIME_TYPES }),
  } satisfies Record<BucketKey, { readonly mimeTypes: ReadonlyArray<string> }>),
});
