// The boot slot behind the module-level `comms` (03 §8.1 "any module may import comms via index.ts"). The
// value is replaced, never mutated; every method re-reads it, so a later `configureComms` wins.
import { createRegistry } from "@/modules/platform";
import type { Comms, CommsRegistry } from "../types";
import { unconfiguredComms } from "./unconfigured-comms";

export const COMMS_REGISTRY: CommsRegistry =
  createRegistry<Comms>(unconfiguredComms);
