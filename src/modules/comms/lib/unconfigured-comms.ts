// The fail-closed default (the `platform` discipline: a port with no implementation refuses rather than
// pretends). `comms` has no template file and no `email_logs` table on `main` yet, so the module-level binding
// answers `INTERNAL` until `src/instrumentation.ts` calls `configureComms` (F-c).
import { err } from "@/modules/platform";
import type { Comms } from "../types";

const refuse = () =>
  err("INTERNAL", "Messaging is not available", {
    reason: "comms-not-configured" as const,
  });

export const unconfiguredComms: Comms = Object.freeze({
  send: async () => refuse(),
  sendMany: async () => refuse(),
  schedule: async () => refuse(),
  cancel: async () => refuse(),
  status: async () => refuse(),
  createInboxMessage: async () => refuse(),
  notifyAdmin: async () => refuse(),
});
