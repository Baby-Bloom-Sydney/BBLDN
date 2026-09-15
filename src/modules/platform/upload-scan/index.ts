// platform/upload-scan connector (07 §5.3 rule 3; ADR-106) — `uploadScanner.scan(input)`; the stub is the
// day-one implementation (MIME allow-list + size cap from `config/uploads.ts`, no network); a real scanner
// (Phase 2) is injected through `configureUploadScanner` behind the same `UploadScanner` type.
export type * from "./types";
export { stubUploadScanner } from "./upload-scan.stub";
export { uploadScanner } from "./lib/default-upload-scanner";
export { configureUploadScanner } from "./lib/configure-upload-scanner";
