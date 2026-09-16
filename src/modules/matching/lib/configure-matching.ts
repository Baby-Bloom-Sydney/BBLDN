// Boot hook: installs the inside the module-level `matching` binding delegates to.
import type { Matching } from "../types";
import { MATCHING_REGISTRY } from "./matching-registry";

export function configureMatching(inside: Matching): void {
  MATCHING_REGISTRY.set(inside);
}
