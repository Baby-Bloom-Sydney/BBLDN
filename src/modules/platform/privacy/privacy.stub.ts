// The in-memory double behind `PrivacyStore` (L3: delete the folder, drop in a stub honouring the connector, the
// app still runs). It models the three behaviours the roads actually depend on and nothing else: a subject has at
// most one open request, a second erasure of an already-erased subject answers `already-erased` and changes
// nothing, and a subject listed as blocked answers `refused` with its reason.
import { ok } from "../lib/ok";
import { err } from "../lib/err";
import type { Result } from "@/modules/shared-types";
import type {
  ErasureObject,
  ErasureOutcome,
  ErasureRefusal,
  ErasureRequest,
  MemoryPrivacyStore,
  PrivacyErrorDetails,
  PrivacyStore,
} from "./types";

const RETAINED = Object.freeze(["money", "consent", "safeguarding"] as const);

type Options = {
  readonly objects?: ReadonlyArray<ErasureObject>;
  readonly subjectsByEmail?: Readonly<Record<string, string>>;
  readonly refuse?: Readonly<Record<string, ErasureRefusal>>;
  readonly unremovable?: ReadonlyArray<string>;
};

type World = {
  readonly requests: ErasureRequest[];
  readonly removed: ErasureObject[];
  readonly erased: string[];
};

const fail = (
  reason: PrivacyErrorDetails["reason"],
  message: string,
): Result<never, PrivacyErrorDetails> =>
  err<PrivacyErrorDetails>("INTERNAL", message, { reason });

const summary = (
  outcome: ErasureOutcome["outcome"],
  extras: Partial<ErasureOutcome> = {},
): ErasureOutcome =>
  Object.freeze({
    outcome,
    retainedClasses: RETAINED,
    scrubbedTables: [],
    objectCount: 0,
    ...extras,
  });

/** One open request per subject, which is `0028`'s partial unique modelled rather than restated. */
function open(
  world: World,
  id: number,
  input: Parameters<PrivacyStore["openRequest"]>[0],
): ErasureRequest {
  const existing = world.requests.find(
    (r) => r.subjectUserId === input.subjectUserId && r.state === "requested",
  );
  if (existing !== undefined) return existing;
  const request: ErasureRequest = Object.freeze({
    requestId: `req-${id}`,
    subjectUserId: input.subjectUserId,
    road: input.road,
    state: "requested" as const,
    refusalReason: null,
    requestedAt: new Date().toISOString() as ErasureRequest["requestedAt"],
  });
  world.requests.push(request);
  return request;
}

/** The one write: a refusal, an already-erased no-op, or an erasure — and the request row closed to match. */
function erase(
  world: World,
  options: Options | undefined,
  input: Parameters<PrivacyStore["runErasure"]>[0],
): Result<ErasureOutcome, PrivacyErrorDetails> {
  const index = world.requests.findIndex(
    (r) => r.requestId === input.requestId,
  );
  const close = (state: ErasureRequest["state"], reason: string | null) => {
    if (index >= 0)
      world.requests[index] = Object.freeze({
        ...world.requests[index],
        state,
        refusalReason: reason,
      });
  };
  const refusal = options?.refuse?.[input.subjectUserId];
  if (refusal === "retry")
    return fail("retry", "A decision is being recorded right now");
  if (refusal !== undefined) {
    close("refused", refusal);
    return ok(summary("refused", { reason: refusal }));
  }
  if (world.erased.includes(input.subjectUserId)) {
    close("completed", null);
    return ok(summary("already-erased"));
  }
  world.erased.push(input.subjectUserId);
  close("completed", null);
  return ok(
    summary("erased", {
      scrubbedTables: ["parents", "user_profiles", "auth.users"],
      objectCount: input.deletedObjects.length,
    }),
  );
}

export function memoryPrivacyStore(options?: Options): MemoryPrivacyStore {
  const world: World = { requests: [], removed: [], erased: [] };
  let nextId = 1;

  return Object.freeze({
    get requests() {
      return [...world.requests];
    },
    get removed() {
      return [...world.removed];
    },
    get erased() {
      return [...world.erased];
    },
    openRequest: async (input) => ok(open(world, nextId++, input)),
    readRequest: async (requestId) =>
      ok(world.requests.find((r) => r.requestId === requestId) ?? null),
    listOpenRequests: async (limit) =>
      ok(world.requests.filter((r) => r.state === "requested").slice(0, limit)),
    findSubjectByEmail: async (email) =>
      ok(options?.subjectsByEmail?.[email] ?? null),
    collectObjects: async (subjectUserId) =>
      ok(
        (options?.objects ?? []).filter(
          (o) => o.entityKind !== "user" || o.entityId === subjectUserId,
        ),
      ),
    removeObject: async (object) => {
      if ((options?.unremovable ?? []).includes(object.path))
        return fail("store-failed", "The object could not be removed");
      world.removed.push(object);
      return ok(undefined);
    },
    runErasure: async (input) => erase(world, options, input),
  });
}
