// The token of the unit of work the current async context is inside, if any — for a port that wants to join
// the caller's transaction without being handed `{ uow }` explicitly.
import type { UnitOfWork } from "@/modules/shared-types";
import { UNIT_OF_WORK_REGISTRY } from "./unit-of-work-registry";

export const currentUnitOfWork = (): UnitOfWork | undefined =>
  UNIT_OF_WORK_REGISTRY.get().current();
