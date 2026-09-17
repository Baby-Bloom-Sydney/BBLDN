// The boot slot behind the module-level `verification`. Replaced, never mutated.
import { createRegistry } from "@/modules/platform";
import type { Verification, VerificationRegistry } from "../types";
import { unconfiguredVerification } from "./unconfigured-verification";

export const VERIFICATION_REGISTRY: VerificationRegistry =
  createRegistry<Verification>(unconfiguredVerification);
