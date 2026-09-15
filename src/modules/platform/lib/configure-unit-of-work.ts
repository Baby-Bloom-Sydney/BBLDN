// Boot hook (03 §1.4 "the transaction opener behind withUnitOfWork is injected at boot"): installs the binding
// `createUnitOfWork(opener)` returned. Called once from `src/instrumentation.ts` (S4) and from test wiring.
import type { UnitOfWorkBinding } from "../types";
import { UNIT_OF_WORK_REGISTRY } from "./unit-of-work-registry";

export function configureUnitOfWork<H>(binding: UnitOfWorkBinding<H>): void {
  UNIT_OF_WORK_REGISTRY.set(binding);
}
