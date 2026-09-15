// Phase 2 hook: installs the chosen scanner (ClamAV worker or a vendor with a UK / EU DPA — ADR-106) behind the
// same `UploadScanner` interface; the upload actions do not change.
import type { UploadScanner } from "../types";
import { UPLOAD_SCANNER_REGISTRY } from "./upload-scanner-registry";

export function configureUploadScanner(scanner: UploadScanner): void {
  UPLOAD_SCANNER_REGISTRY.set(scanner);
}
