// `platform/events` (03 §9.2 / §9.5) — the `event-log` store over `auth`'s port (the `events` table, service
// scope), the module-level `consent` as the `ConsentReader` (07 §2.9 — `fbclid` rides only with marketing
// consent) and the `console` sink in development only (03 §9.5: "dev + test"). The `vercel-analytics` and
// `meta` sinks are Phase 4c's and are not pretended here.
import { auth } from "@/modules/auth";
import type { Environment } from "@/modules/config";
import {
  configureEvents,
  consent,
  consoleEventSink,
  createEvents,
  log,
} from "@/modules/platform";
import { dbEventLogStore } from "./db-event-log-store";
import type { PortWiring } from "./types";

const READS_CLOSED =
  "the two admin read helpers (queryEvents · countByName) fail closed — the Query surface has no predicate or aggregate; they belong over 02 §7's views";

export function wireEvents(environment: Environment): PortWiring {
  configureEvents(
    createEvents({
      store: dbEventLogStore(auth.data),
      sinks: environment === "development" ? [consoleEventSink(log)] : [],
      log,
      consent,
    }),
  );
  return {
    port: "events",
    binding: "db-event-log (events table, service scope; insert only)",
    reason: READS_CLOSED,
  };
}
