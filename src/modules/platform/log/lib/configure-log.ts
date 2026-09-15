// Boot hook: `configureLog({ format, tracker, minLevel })` from `src/instrumentation.ts` (S4 / F-c) once the
// environment is parsed — `format` from the environment, `tracker` from `resolveErrorTracker({ dsn, capture })`.
import type { LogConfiguration } from "../types";
import { consoleSink } from "./console-sink";
import { createLogger } from "./create-logger";
import { LOG_REGISTRY } from "./log-registry";

export function configureLog(configuration: LogConfiguration): void {
  LOG_REGISTRY.set(
    createLogger({
      sink: consoleSink(configuration.format ?? "json"),
      tracker: configuration.tracker,
      minLevel: configuration.minLevel ?? "info",
    }),
  );
}
