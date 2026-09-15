// The boot slot for the module-level `withUnitOfWork`. Until the boot code (S4: `auth` owns the data client)
// installs a binding, every unit of work fails closed — nothing can "commit" against a stub by accident.
import type { UnitOfWorkBinding } from "../types";
import { createRegistry } from "./create-registry";
import { createUnitOfWork } from "./create-unit-of-work";
import { err } from "./err";

const NOT_CONFIGURED = err("INTERNAL", "Unit of work is not configured", {
  reason: "unit-of-work-not-configured",
});

const unconfigured = createUnitOfWork<never>({
  begin: async () => NOT_CONFIGURED,
  commit: async () => NOT_CONFIGURED,
  rollback: async () => NOT_CONFIGURED,
});

export const UNIT_OF_WORK_REGISTRY =
  createRegistry<UnitOfWorkBinding<unknown>>(unconfigured);
