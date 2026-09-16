// Installed by the later, inline-reviewed unit that builds the evidence path (ADR-117 Tier A).
import type { VettingSubmissionStore } from "../types";
import { VETTING_STORE_REGISTRY } from "./vetting-store-registry";

export function configureVettingStore(next: VettingSubmissionStore): void {
  VETTING_STORE_REGISTRY.set(next);
}
