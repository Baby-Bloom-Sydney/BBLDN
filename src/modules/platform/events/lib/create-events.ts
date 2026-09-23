// 03 §9.2 / §9.5 — the events connector's inside. `emit`: validate once → envelope → event-log row (inside
// `opts.uow` when given: its failure is the caller's; otherwise logged) → post-commit fan-out (never fails the
// caller) → one structured log line. `subscribe` is the boot-time sink registry; the two read helpers delegate
// to the store. `fbclid` rides only with marketing consent (07 §2.9).
import { EVENT_NAMES } from "@/modules/shared-types";
import type { EventId, EventName, Result } from "@/modules/shared-types";
import type {
  EmitErrorDetails,
  EmitInput,
  EmitOptions,
  EventEnvelope,
  EventsConnector,
  EventsDeps,
  Sink,
} from "../types";
import { err } from "../../lib/err";
import { fromThrown } from "../../lib/from-thrown";
import { newId } from "../../lib/new-id";
import { nowInstant } from "../../lib/now-instant";
import { ok } from "../../lib/ok";
import { fanOut } from "./fan-out";
import { validateEmitInput } from "./validate-emit-input";

const DEFAULT_TIMEOUT_MS = 2000;
type Subscription = {
  readonly sink: Sink;
  readonly names: ReadonlySet<EventName> | "*";
};
type Resolved = Required<
  Pick<EventsDeps, "store" | "log" | "clock" | "newId" | "defaultTimeoutMs">
> &
  Pick<EventsDeps, "consent">;

async function stripFbclid<N extends EventName>(
  input: EmitInput<N>,
  deps: Resolved,
): Promise<EmitInput<N>> {
  const attribution = input.attribution;
  if (attribution?.fbclid === undefined) return input;
  const subject =
    input.actor.kind === "user"
      ? { kind: "user" as const, id: input.actor.id }
      : input.actor.kind === "visitor"
        ? { kind: "visitor" as const, id: input.actor.id }
        : undefined;
  const consented =
    subject !== undefined && deps.consent !== undefined
      ? await deps.consent.hasMarketing(subject)
      : undefined;
  if (consented?.ok && consented.value) return input;
  const { fbclid: _dropped, ...rest } = attribution;
  return { ...input, attribution: rest };
}

function buildEnvelope<N extends EventName>(
  input: EmitInput<N>,
  source: "server" | "client",
  deps: Resolved,
): EventEnvelope<N> {
  return Object.freeze({
    ...input,
    id: deps.newId(),
    ts: input.ts ?? deps.clock(),
    source,
  }) as EventEnvelope<N>;
}

async function writeLog(
  envelope: EventEnvelope,
  opts: EmitOptions,
  deps: Resolved,
): Promise<Result<void>> {
  const written = await deps.store.insert(envelope, { uow: opts.uow });
  if (written.ok || opts.uow !== undefined) return written;
  deps.log.warn("event sink failed", {
    alert: "ALERT_EVENT_SINK_FAILED",
    sink: "event-log",
    reason: written.error.code,
    eventName: envelope.name,
    eventId: envelope.id,
    requestId: envelope.requestId,
    cause: written.error.cause,
  });
  return ok(undefined);
}

async function emitOnce<N extends EventName>(
  input: EmitInput<N>,
  opts: EmitOptions,
  deps: Resolved,
  sinks: ReadonlyArray<Subscription>,
): Promise<Result<{ readonly id: EventId }, EmitErrorDetails>> {
  const source = opts.source ?? "server";
  const validated = validateEmitInput(input, source);
  if (!validated.ok) return validated;
  const envelope = buildEnvelope(
    await stripFbclid(validated.value, deps),
    source,
    deps,
  );
  const logged = await writeLog(envelope, opts, deps);
  if (!logged.ok)
    return err(
      "INTERNAL",
      "Event log write failed",
      { reason: "event-log" },
      logged.error,
    );
  const matching = sinks
    .filter((s) => s.names === "*" || s.names.has(envelope.name))
    .map((s) => s.sink);
  const outcomes = await fanOut(envelope, matching, deps);
  deps.log.info("event.emitted", {
    eventName: envelope.name,
    eventId: envelope.id,
    requestId: envelope.requestId,
    positionId: envelope.positionId,
    source,
    sinkCount: outcomes.length,
    failedSinks: outcomes.filter((o) => !o.ok).length,
  });
  return ok({ id: envelope.id });
}

export function createEvents(deps: EventsDeps): EventsConnector {
  const resolved: Resolved = {
    store: deps.store,
    log: deps.log,
    consent: deps.consent,
    clock: deps.clock ?? nowInstant,
    newId: deps.newId ?? (() => newId<EventId>()),
    defaultTimeoutMs: deps.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  const registry = {
    subscriptions: (deps.sinks ?? []).map(
      (sink): Subscription => ({
        sink,
        names: "*",
      }),
    ),
  };
  const knownNames: ReadonlySet<string> = new Set(EVENT_NAMES);

  const connector: EventsConnector = {
    emit: async <N extends EventName>(
      input: EmitInput<N>,
      opts: EmitOptions = {},
    ) => {
      try {
        return await emitOnce(input, opts, resolved, registry.subscriptions);
      } catch (thrown) {
        const failure = fromThrown(thrown, {
          module: "platform",
          action: "events.emit",
        });
        resolved.log.error("event.emit threw", {
          eventName: input.name,
          requestId: input.requestId,
          errorCode: failure.error.code,
          cause: thrown,
        });
        return err(
          "INTERNAL",
          failure.error.message,
          { reason: "unexpected" },
          thrown,
        );
      }
    },
    subscribe: (names, sink) => {
      const filter =
        names === "*"
          ? ("*" as const)
          : new Set(
              (typeof names === "string" ? [names] : names).filter((n) =>
                knownNames.has(n),
              ),
            );
      const subscription: Subscription = { sink, names: filter };
      registry.subscriptions = [...registry.subscriptions, subscription];
      return () => {
        registry.subscriptions = registry.subscriptions.filter(
          (s) => s !== subscription,
        );
      };
    },
    listSinks: () => [
      "event-log" as const,
      ...registry.subscriptions.map((s) => s.sink.id),
    ],
    queryEvents: (q) => resolved.store.query(q),
    countByName: (q) => resolved.store.countByName(q),
  };
  return Object.freeze(connector);
}
