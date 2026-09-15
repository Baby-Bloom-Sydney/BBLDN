// platform/upload-scan — the anti-malware scan interface of 07 §5.3 rule 3, stubbed on day one (ADR-106: no
// third-party scanner; uploads restricted to the `config/uploads.ts` MIME lists and size cap, MIME-sniffed by
// the upload action). The product (ClamAV worker or a vendor with a UK / EU DPA — never a public-scan API for
// DBS documents) lands at Phase 2 behind this same interface.
import type { BucketKey, Result } from "@/modules/shared-types";

export type ScanVerdict = "clean" | "infected" | "unavailable";

export type ScanInput = {
  readonly bucket: BucketKey;
  /** the sniffed MIME type (07 §5.3 rule 3 — the action sniffs; the scanner trusts the sniff) */
  readonly mime: string;
  readonly bytes: number;
  /** object path for the log line and the quarantine metadata; never the content, never a URL */
  readonly objectPath?: string;
  /** the bytes themselves, for a real scanner; the stub never reads them */
  readonly content?: Uint8Array;
};

export type ScanResult = {
  readonly verdict: ScanVerdict;
  /** which implementation answered (`stub` day one) */
  readonly scanner: string;
};

/** 07 §5.3 rule 4 envelope reasons the scanner itself can raise (the rest belong to the upload action). */
export type UploadScanDetails = {
  readonly reason: "invalid_type" | "file_too_large";
};

export type UploadScanner = {
  readonly id: string;
  scan(input: ScanInput): Promise<Result<ScanResult, UploadScanDetails>>;
};
