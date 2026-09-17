// platform/unit-of-work connector (01 §6.3; 03 §1.4; ADR-127) — `withUnitOfWork` + the opaque `UnitOfWork`
// token every connector accepts as `{ uow? }`, `configureUnitOfWork` (the boot hook), the two openers and the
// join a data port is handed. The production opener is `rpcTransactionOpener` — the transaction is the
// database function at the RPC boundary (ADR-127); `memoryTransactionOpener` is the stub the swap tests run on.
export type * from "./types";
export { createUnitOfWork } from "./lib/create-unit-of-work";
export { withUnitOfWork } from "./lib/with-unit-of-work";
export { currentUnitOfWork } from "./lib/current-unit-of-work";
export { unitOfWorkJoin } from "./lib/unit-of-work-join";
export { configureUnitOfWork } from "./lib/configure-unit-of-work";
export { memoryTransactionOpener } from "./lib/memory-transaction-opener";
export { rpcTransactionOpener } from "./lib/rpc-transaction-opener";
