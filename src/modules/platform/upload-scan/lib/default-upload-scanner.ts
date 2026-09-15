// 07 §5.3 rule 3 — the scanner every upload action calls; delegates to the registry.
import type { UploadScanner } from "../types";
import { UPLOAD_SCANNER_REGISTRY } from "./upload-scanner-registry";

export const uploadScanner: UploadScanner = Object.freeze({
  get id() {
    return UPLOAD_SCANNER_REGISTRY.get().id;
  },
  scan: (input) => UPLOAD_SCANNER_REGISTRY.get().scan(input),
});
