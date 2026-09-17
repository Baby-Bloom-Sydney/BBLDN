// The checks every K row makes before it moves anything: the 03 §2.5 actor rule, the row's `from` / `version`,
// and the vocabulary of refusals 03 §2.5 closes over. Shared by all 25 rows so a refusal reads the same
// wherever it comes from — an admin reading an incident log should not have to know which row raised it.
//
// One exported value (the boundary lint's one-export rule; the types describing it come with it).
import { err, ok } from "@/modules/platform";
import type {
  Actor,
  AdvanceInput,
  ConnectionStage,
  Result,
  TransitionMover,
  TransitionSpec,
} from "@/modules/shared-types";
import type { ConnectionRecord } from "../types";

type Input = AdvanceInput<import("@/modules/shared-types").TransitionId>;

const moverOf = (actor: Actor): TransitionMover => {
  if (actor.kind === "admin") return "admin";
  if (actor.kind === "system") return "system";
  return actor.role === "parent" ? "user:parent" : "user:nanny";
};

/**
 * 03 §2.5 "a `user` fires only rows listing their role, **only on entities they are party to**". A connection
 * has two parties, and which one a user is decides both halves: a parent may not move another family's
 * connection, and a nanny may not move one that is not hers. An admin is neither party and is allowed by the
 * row; a system job is allowed only where `systemJobs` names it.
 */
function checkActor(
  spec: TransitionSpec,
  actor: Actor,
  record: ConnectionRecord | null,
): Result<void> {
  if (!spec.movers.includes(moverOf(actor)))
    return err("FORBIDDEN", "This actor may not move the connection", {
      reason: "E_ACTOR_FORBIDDEN" as const,
      which: "mover" as const,
    });
  if (actor.kind === "user" && record !== null) {
    const party =
      actor.role === "parent"
        ? (record.parentId as string)
        : (record.nannyId as string);
    if (party !== (actor.id as string))
      return err("FORBIDDEN", "This actor may not move the connection", {
        reason: "E_ACTOR_FORBIDDEN" as const,
        which: "not-party" as const,
      });
  }
  if (actor.kind === "system" && !(spec.systemJobs ?? []).includes(actor.id))
    return err("FORBIDDEN", "This actor may not move the connection", {
      reason: "E_ACTOR_FORBIDDEN" as const,
      which: "job-not-named" as const,
    });
  return ok(undefined);
}

/** The row's `from` and the caller's `expectedFrom`, with `Idem.` deciding what "already there" means. */
function checkFrom(
  spec: TransitionSpec,
  input: Input,
  current: ConnectionStage | null,
): Result<"proceed" | "noop"> {
  if (input.expectedFrom !== current)
    return err("CONFLICT", "The connection has moved since you read it", {
      reason: "E_STALE_STATE" as const,
      which: "expectedFrom",
    });
  if (spec.from.includes(current)) return ok("proceed");
  if (current === spec.to)
    return spec.idempotency === "reject"
      ? err("CONFLICT", "The connection has moved since you read it", {
          reason: "E_STALE_STATE" as const,
          which: "already-there",
        })
      : ok("noop");
  return err("CONFLICT", "That move is not allowed from here", {
    reason: "E_TRANSITION_NOT_ALLOWED" as const,
    from: current,
    to: spec.to,
  });
}

export const CONNECTION_GUARDS = Object.freeze({
  moverOf,
  checkActor,
  checkFrom,
  precondition: (which: string) =>
    err("CONFLICT", "The connection cannot move yet", {
      reason: "E_PRECONDITION_FAILED" as const,
      which,
    }),
  invalidPayload: (which: string) =>
    err("VALIDATION", "The transition payload is not what the row carries", {
      reason: "E_PAYLOAD_INVALID" as const,
      which,
    }),
  notFound: () =>
    err("NOT_FOUND", "No such connection", {
      reason: "E_ENTITY_NOT_FOUND" as const,
      entity: "connection" as const,
    }),
});
