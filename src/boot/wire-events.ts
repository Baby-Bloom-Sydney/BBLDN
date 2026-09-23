// `platform/events` (03 §9.2 / §9.5) — the `event-log` store over `auth`'s port (the `events` table, service
// scope), the module-level `consent` as the `ConsentReader` (07 §2.9 — `fbclid` rides only with marketing
// consent) and the `console` sink in development only (03 §9.5: "dev + test").
//
// The **`meta` sink** (`4c`; ADR-055) is bound here, and **only when the London dataset actually exists**.
// `META_DATASET_ID` and `META_CAPI_ACCESS_TOKEN` are `—` in dev and preview (`config/lib/env-schema.ts`), so on
// every environment but production the sink is absent and nothing is sent — which is the right answer, not a
// gap: a preview posting real conversions into the live dataset is worse than a preview posting none. When it
// is unset the boot report says so in the `reason`, because a port left closed carries its reason on the report
// rather than silence (`unwired-ports.ts`'s invariant).
//
// The `vercel-analytics` sink of 03 §9.5 is still unbuilt: it needs the client seam (`track` →
// `POST /api/events`, unit F-c) before it has client events to forward, and a sink with no producer would be a
// declared-and-uncalled thing (`ecc-lite` rule 3). It is named here so the next reader does not have to wonder
// whether it was forgotten.
import { auth } from "@/modules/auth";
import type { Environment } from "@/modules/config";
import { META_API } from "@/modules/config/server";
import {
  configureEvents,
  consent,
  consoleEventSink,
  createEvents,
  log,
  metaSink,
  type Sink,
} from "@/modules/platform";
import { dbEventLogStore } from "./db-event-log-store";
import type { PortWiring } from "./types";

const READS_KEYED =
  "queryEvents is live on the two indexed access paths (position · subject) through the keyed read (ADR-131 (1)); an unkeyed query is refused (event-log-read-requires-key) and countByName stays closed — an aggregate has no key and belongs over 02 §7's views";

const META_UNSET =
  "the meta sink is NOT bound: META_DATASET_ID / META_CAPI_ACCESS_TOKEN are unset, so no conversion reaches any dataset (fail closed). Conversions API delivery stays unproven until BAI provides the London dataset id and token (08 §8 item 3)";

const META_BOUND =
  "meta sink bound to the configured dataset; every send is gated on ConsentReader.hasMarketing and carries event_id = envelope.id for pixel/CAPI deduplication (03 §9.5)";

function sinksFor(environment: Environment): ReadonlyArray<Sink> {
  const endpoint = META_API.endpoint;
  const accessToken = META_API.accessToken;
  return [
    ...(environment === "development" ? [consoleEventSink(log)] : []),
    ...(META_API.configured &&
    endpoint !== undefined &&
    accessToken !== undefined
      ? [metaSink({ endpoint, accessToken, consent })]
      : []),
  ];
}

export function wireEvents(environment: Environment): PortWiring {
  configureEvents(
    createEvents({
      store: dbEventLogStore(auth.data),
      sinks: sinksFor(environment),
      log,
      consent,
    }),
  );
  return {
    port: "events",
    binding: `db-event-log (events table, service scope; insert + keyed query)${META_API.configured ? " + meta" : ""}`,
    reason: `${READS_KEYED}; ${META_API.configured ? META_BOUND : META_UNSET}`,
  };
}
