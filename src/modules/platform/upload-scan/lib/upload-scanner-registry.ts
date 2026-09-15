// The boot slot for the module-level `uploadScanner`. The stub IS the day-one implementation (ADR-106), so the
// default is real, not fail-closed; Phase 2 installs the chosen product through `configureUploadScanner`.
import type { UploadScanner } from "../types";
import { createRegistry } from "../../lib/create-registry";
import { stubUploadScanner } from "../upload-scan.stub";

export const UPLOAD_SCANNER_REGISTRY =
  createRegistry<UploadScanner>(stubUploadScanner);
