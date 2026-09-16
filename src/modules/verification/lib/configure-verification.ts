// Installed by the later, inline-reviewed unit that builds the evidence path (ADR-117 Tier A).
import type { Verification } from "../types";
import { VERIFICATION_REGISTRY } from "./verification-registry";

export function configureVerification(next: Verification): void {
  VERIFICATION_REGISTRY.set(next);
}
