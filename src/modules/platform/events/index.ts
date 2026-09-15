// platform/events connector (03 §9.2 / §9.5; 01 §7) — `Events` is the connector object every emitter uses;
// `configureEvents` is the boot hook (the `event-log` store, the post-commit sinks and the `ConsentReader` are
// injected in `src/instrumentation.ts` so platform stays a leaf). `memorySink` / `memoryEventLogStore` are the
// stubs the swap tests run on (05 §3 row 8). The client seam `platform/events/client.ts` (`track`) lands with
// `POST /api/events` (F-c).
export type * from "./types";
export { EVENT_SCHEMAS } from "./schemas";
export { isClientEventName } from "./lib/is-client-event-name";
export { validateEmitInput } from "./lib/validate-emit-input";
export { createEvents } from "./lib/create-events";
export { memorySink } from "./lib/memory-sink";
export { consoleEventSink } from "./lib/console-event-sink";
export { memoryEventLogStore } from "./lib/memory-event-log-store";
export { Events } from "./lib/default-events";
export { configureEvents } from "./lib/configure-events";
