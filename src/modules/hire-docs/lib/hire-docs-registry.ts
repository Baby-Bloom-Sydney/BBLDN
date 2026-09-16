// The boot slot for the module-level `hireDocs` binding. Fails closed until `configureHireDocs` installs a
// renderer: the document is a legal artefact whose wording `04.20` still owes, and a placeholder PDF attached to
// a real hire confirmation would be worse than no PDF at all.
import { err } from "@/modules/platform";
import type { Registry } from "@/modules/platform";
import type { HireDocs } from "../types";

const NOT_CONFIGURED = err("INTERNAL", "Hire docs is not configured", {
  reason: "hire-docs-not-configured" as const,
});

const unconfigured: HireDocs = Object.freeze({
  renderHireSummary: async () => NOT_CONFIGURED,
});

const slot = { current: unconfigured };

export const HIRE_DOCS_REGISTRY: Registry<HireDocs> = Object.freeze({
  get: () => slot.current,
  set: (next: HireDocs) => {
    slot.current = next;
  },
});
