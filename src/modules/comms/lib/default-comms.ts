// The module-level `comms` every module imports (01 §2.4). It delegates to the registry, so the binding a
// module captured at import time still follows a later `configureComms`.
import type { Comms } from "../types";
import { COMMS_REGISTRY } from "./comms-registry";

export const comms: Comms = Object.freeze({
  send: (message) => COMMS_REGISTRY.get().send(message),
  sendMany: (messages) => COMMS_REGISTRY.get().sendMany(messages),
  schedule: (message) => COMMS_REGISTRY.get().schedule(message),
  cancel: (dedupeKey) => COMMS_REGISTRY.get().cancel(dedupeKey),
  status: (messageId) => COMMS_REGISTRY.get().status(messageId),
  createInboxMessage: (msg, opts) =>
    COMMS_REGISTRY.get().createInboxMessage(msg, opts),
  notifyAdmin: (input) => COMMS_REGISTRY.get().notifyAdmin(input),
});
