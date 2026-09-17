// Boot hook: installs the inside `childLinking` delegates to (`src/instrumentation.ts` → `wire-app.ts`).
import type { ChildLinking } from "../types";
import { CHILD_LINKING_REGISTRY } from "./child-linking-registry";

export function configureChildLinking(inside: ChildLinking): void {
  CHILD_LINKING_REGISTRY.set(inside);
}
