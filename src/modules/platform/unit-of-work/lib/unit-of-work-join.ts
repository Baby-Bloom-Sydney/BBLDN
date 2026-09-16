// The module-level `UnitOfWorkJoin` (ADR-127) — what a data port defaults to when boot hands it nothing: it
// delegates to whatever binding `configureUnitOfWork` installed, so a `{ uow }` a caller holds is honoured the
// moment the boot file wires the opener, and refused (`unit-of-work-unknown`) while it has not.
import type { UnitOfWork } from "@/modules/shared-types";
import type { UnitOfWorkJoin } from "../types";
import { UNIT_OF_WORK_REGISTRY } from "./unit-of-work-registry";

export const unitOfWorkJoin: UnitOfWorkJoin = Object.freeze({
  isOpen: (uow: UnitOfWork) => UNIT_OF_WORK_REGISTRY.get().join.isOpen(uow),
  claimRpc: (uow: UnitOfWork) => UNIT_OF_WORK_REGISTRY.get().join.claimRpc(uow),
});
