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
  /** Subjects a retention window still holds, and which class holds them (07 §6.1 step 6). */
  readonly retain?: Readonly<Record<string, (typeof RETAINED)[number]>>;
};

type World = {
  readonly requests: ErasureRequest[];
  readonly removed: ErasureObject[];
  readonly erased: string[];
  readonly purged: string[];
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

/**
 * The purge half of the stub (07 §6.1 step 6; L-009 `3g`). Its own function because `memoryPrivacyStore` is at
 * the 50-line ceiling and this is a separable behaviour: three rules, and nothing about the erasure half.
 */
function purgeOps(
  world: World,
  options: Options | undefined,
): Pick<MemoryPrivacyStore, "listPurgeCandidates" | "purgeSubject"> {
  return {
    // 07 §6.1 step 6 (L-009 `3g`). The stub models the three behaviours a caller depends on and nothing else:
    // a subject is a candidate once she has been erased, a subject named in `retain` is refused with that
    // class's reason, and a second purge of an already-purged subject answers `already-purged`.
    listPurgeCandidates: async ({ limit }) =>
      ok(
        world.erased
          .filter((subjectUserId) => !world.purged.includes(subjectUserId))
          .slice(0, limit)
          .map((subjectUserId) =>
            Object.freeze({
              subjectUserId,
              scrubbedAt: "2026-01-01T00:00:00.000Z" as never,
            }),
          ),
      ),
    purgeSubject: async ({ subjectUserId, windows }) => {
      // The ADR-179 rule the real function enforces: a class with no window is not one to skip quietly.
      for (const name of RETAINED)
        if (windows[name] === undefined)
          return fail("store-failed", `no retention window for ${name}`);
      if (world.purged.includes(subjectUserId))
        return ok(Object.freeze({ outcome: "already-purged" as const }));
      if (!world.erased.includes(subjectUserId))
        return ok(
          Object.freeze({ outcome: "refused" as const, reason: "not-erased" }),
        );
      const held = options?.retain?.[subjectUserId];
      if (held !== undefined)
        return ok(
          Object.freeze({
            outcome: "refused" as const,
            reason: `retained-${held}`,
          }),
        );
      world.purged.push(subjectUserId);
      return ok(Object.freeze({ outcome: "purged" as const }));
    },
  };
}

export function memoryPrivacyStore(options?: Options): MemoryPrivacyStore {
  const world: World = { requests: [], removed: [], erased: [], purged: [] };
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
    ...purgeOps(world, options),
  });
}
