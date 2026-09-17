// The boot slot for the module-level `hireDocs` binding. Fails closed until `configureHireDocs` installs a
// renderer: the document is a legal artefact whose wording `04.20` still owes, and a placeholder PDF attached to
// a real hire confirmation would be worse than no PDF at all.
import { createRegistry, err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { HireDocs } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Hire docs is not configured", {
  reason: "hire-docs-not-configured" as const,
});

const unconfigured: HireDocs = Object.freeze({
  renderHireSummary: async () => NOT_CONFIGURED,
});

export const HIRE_DOCS_REGISTRY: Registry<HireDocs> =
  createRegistry<HireDocs>(unconfigured);
