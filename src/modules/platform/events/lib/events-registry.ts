// The boot slot for the module-level `Events`. Until `configureEvents` runs, the store refuses every write
// (INTERNAL, events-not-configured): without a unit of work that is one warn line per emit and the caller still
// gets ok (03 §9.2 rule 1); under a unit of work the caller's transaction fails — loud, never a silent drop.
import type { EventLogStore, EventsConnector } from "../types";
import { createRegistry } from "../../lib/create-registry";
import { err } from "../../lib/err";
import { log } from "../../log/lib/default-log";
import { createEvents } from "./create-events";

const NOT_CONFIGURED = err("INTERNAL", "Events are not configured", {
  reason: "events-not-configured",
});

const unconfiguredStore: EventLogStore = Object.freeze({
  insert: async () => NOT_CONFIGURED,
  query: async () => NOT_CONFIGURED,
  countByName: async () => NOT_CONFIGURED,
});

export const EVENTS_REGISTRY = createRegistry<EventsConnector>(
  createEvents({ store: unconfiguredStore, log }),
);
