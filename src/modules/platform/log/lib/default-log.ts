// 01 §4b — `log`, the one helper every module imports. Delegates to the logger the registry holds so a
// `configureLog` at boot (or in a test) is seen by every caller, including ones that imported `log` earlier.
import type { Log, LogFields } from "../types";
import { LOG_REGISTRY } from "./log-registry";

export const log: Log = Object.freeze({
  debug: (msg: string, fields?: LogFields) =>
    LOG_REGISTRY.get().debug(msg, fields),
  info: (msg: string, fields?: LogFields) =>
    LOG_REGISTRY.get().info(msg, fields),
  warn: (msg: string, fields?: LogFields) =>
    LOG_REGISTRY.get().warn(msg, fields),
  error: (msg: string, fields?: LogFields) =>
    LOG_REGISTRY.get().error(msg, fields),
  child: (fields: LogFields) => LOG_REGISTRY.get().child(fields),
});
