// Boot hook (03 §9.5 "sinks are registered at boot in src/instrumentation.ts"): installs the connector built by
// `createEvents({ store, sinks, log, consent })` — the real event-log store over `auth`'s port, the post-commit
// sinks, the `ConsentReader`. Test wiring installs `createEvents({ store: memoryEventLogStore(), … })`.
import type { EventsConnector } from "../types";
import { EVENTS_REGISTRY } from "./events-registry";

export function configureEvents(events: EventsConnector): void {
  EVENTS_REGISTRY.set(events);
}
