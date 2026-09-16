// Boot hook: installs the reads `childLinking` delegates to (`src/instrumentation.ts`).
import type { ChildLinkingReads } from "../types";
import { CHILD_LINKING_REGISTRY } from "./child-linking-registry";

export function configureChildLinking(reads: ChildLinkingReads): void {
  CHILD_LINKING_REGISTRY.set(reads);
}
