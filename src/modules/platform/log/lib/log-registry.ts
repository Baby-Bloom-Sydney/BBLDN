// The boot slot for the module-level `log`. The default is usable before any wiring: JSON lines when NODE_ENV is
// production (01 §4b), a readable line otherwise, `debug` shown only outside production, the null tracker.
import { publicEnv } from "@/modules/config";
import type { Log } from "../types";
import { createRegistry } from "../../lib/create-registry";
import { consoleSink } from "./console-sink";
import { createLogger } from "./create-logger";

const isProduction = publicEnv.NODE_ENV === "production";

export const LOG_REGISTRY = createRegistry<Log>(
  createLogger({
    sink: consoleSink(isProduction ? "json" : "pretty"),
    minLevel: isProduction ? "info" : "debug",
  }),
);
