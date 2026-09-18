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
  // The **storage** ceiling: 07 §5.3 rule 3's "10 MB unconditional" and the buckets' own `file_size_limit`
  // (02 §8). It is what an object at rest may weigh, and it is not what a request may carry — see below.
  maxBytes: 10 * MEGABYTE,
  // The **transport** ceiling, and the only number a screen may promise (REVIEW-3 M-9 / R-5).
  //
  // A server action is a POST to a Vercel serverless function, whose request body is capped near 4.5 MB. Above
  // that the platform refuses the request before any application code runs, so `maxBytes` on a file input was a
  // promise the deployed platform could not keep — and nothing measured it, because every suite runs in-process
  // where there is no transport to say no. 4 MB leaves room for the form's other fields inside that budget.
  //
  // **The residual, stated rather than hidden.** S-N-05 posts *two* files in one action (document + selfie), so
  // two at this cap still exceed the request budget. Halving the cap again would refuse an ordinary passport
  // photograph, so the close is not a smaller number: it is the **direct-to-storage signed upload** — the
  // browser PUTs to Supabase Storage with a server-minted signed URL and the action carries only the object
  // path, which takes the files out of the request body entirely. Recorded as the later path, not built here
  // (B-item; 07 §5.3 rule 3's road, unchanged by this cap).
  maxUploadBytes: 4 * MEGABYTE,
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
