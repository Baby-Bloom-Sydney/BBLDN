// 03 §10.1 — the connector object `placements` imports. Re-reads the registry on every call.
import type { HireDocs } from "../types";
import { HIRE_DOCS_REGISTRY } from "./hire-docs-registry";

export const hireDocs: HireDocs = Object.freeze({
  renderHireSummary: (input) =>
    HIRE_DOCS_REGISTRY.get().renderHireSummary(input),
});
