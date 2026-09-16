// Boot hook: installs the renderer the module-level `hireDocs` binding delegates to.
import type { HireDocs } from "../types";
import { HIRE_DOCS_REGISTRY } from "./hire-docs-registry";

export function configureHireDocs(renderer: HireDocs): void {
  HIRE_DOCS_REGISTRY.set(renderer);
}
