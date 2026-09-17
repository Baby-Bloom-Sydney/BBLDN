// The boot slot behind the module-level `scheduling`. Replaced, never mutated; every method re-reads it.
import { createRegistry } from "@/modules/platform";
import type { Scheduling, SchedulingRegistry } from "../types";
import { unconfiguredScheduling } from "./unconfigured-scheduling";

export const SCHEDULING_REGISTRY: SchedulingRegistry =
  createRegistry<Scheduling>(unconfiguredScheduling);
