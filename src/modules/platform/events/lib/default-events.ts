// 03 §9.2 `Events` — the connector object every emitter imports (`Events.emit(input, { uow? })`, 01 §2.4).
// Delegates to what the registry holds so `configureEvents` at boot reaches every earlier importer.
import type { EventName } from "@/modules/shared-types";
import type { EmitInput, EmitOptions, EventsConnector } from "../types";
import { EVENTS_REGISTRY } from "./events-registry";

export const Events: EventsConnector = Object.freeze({
  emit: <N extends EventName>(input: EmitInput<N>, opts?: EmitOptions) =>
    EVENTS_REGISTRY.get().emit(input, opts),
  subscribe: (names, sink) => EVENTS_REGISTRY.get().subscribe(names, sink),
  listSinks: () => EVENTS_REGISTRY.get().listSinks(),
  queryEvents: (q) => EVENTS_REGISTRY.get().queryEvents(q),
  countByName: (q) => EVENTS_REGISTRY.get().countByName(q),
});
