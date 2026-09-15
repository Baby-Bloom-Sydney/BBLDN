// 03 §1.4 — the module-level `platform.withUnitOfWork(fn)` every module calls; delegates to the binding the
// boot code installed (`configureUnitOfWork`).
import type { WithUnitOfWork } from "@/modules/shared-types";
import { UNIT_OF_WORK_REGISTRY } from "./unit-of-work-registry";

export const withUnitOfWork: WithUnitOfWork = (fn) =>
  UNIT_OF_WORK_REGISTRY.get().withUnitOfWork(fn);
