// The unit of work (01 §6.3; 03 §1.4) over the RPC-boundary opener — ADR-127: one RPC is one transaction. The
// binding is returned as well as installed, because `auth`'s data port is handed its `join` explicitly (the
// composition root says what it composed, rather than leaving a port to find a module-level default).
import {
  configureUnitOfWork,
  createUnitOfWork,
  rpcTransactionOpener,
} from "@/modules/platform";
import type { RpcTransaction, UnitOfWorkBinding } from "@/modules/platform";
import type { PortWiring } from "./types";

export function wireUnitOfWork(): {
  readonly binding: UnitOfWorkBinding<RpcTransaction>;
  readonly report: PortWiring;
} {
  const binding = createUnitOfWork(rpcTransactionOpener());
  configureUnitOfWork(binding);
  return Object.freeze({
    binding,
    report: { port: "unit-of-work", binding: "rpc-boundary (ADR-127)" },
  });
}
