// The boot slot for the submission store. Replaced, never mutated.
import { createRegistry } from "@/modules/platform";
import type { VettingStoreRegistry, VettingSubmissionStore } from "../types";
import { unconfiguredVettingStore } from "./unconfigured-vetting-store";

export const VETTING_STORE_REGISTRY: VettingStoreRegistry =
  createRegistry<VettingSubmissionStore>(unconfiguredVettingStore);
