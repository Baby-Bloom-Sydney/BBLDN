// The checks every L row makes before it moves anything: the 03 §2.5 actor rule, the row's `from` / `version`,
// and the closed vocabulary of refusals. The same shape `connections` uses, and deliberately so — an admin
// reading an incident log should not have to know which slice raised a refusal to read it.
import { err, ok } from "@/modules/platform";
import type {
  Actor,
  AdvanceInput,
  PlacementState,
  Result,
  TransitionId,
  TransitionMover,
  TransitionSpec,
} from "@/modules/shared-types";
import type { PlacementRecord } from "../types";

type Input = AdvanceInput<TransitionId>;

const moverOf = (actor: Actor): TransitionMover => {
  if (actor.kind === "admin") return "admin";
  if (actor.kind === "system") return "system";
  return actor.role === "parent" ? "user:parent" : "user:nanny";
};

/** A placement has two parties (03 §2.4 L-2 lists both), so "party" means either side of the hire. */
function checkActor(
  spec: TransitionSpec,
  actor: Actor,
  record: PlacementRecord | null,
): Result<void> {
  if (!spec.movers.includes(moverOf(actor)))
    return err("FORBIDDEN", "This actor may not move the placement", {
      reason: "E_ACTOR_FORBIDDEN" as const,
      which: "mover" as const,
    });
  if (actor.kind === "user" && record !== null) {
    const party =
      actor.role === "parent"
        ? (record.parentId as string)
        : (record.nannyId as string);
    if (party !== (actor.id as string))
      return err("FORBIDDEN", "This actor may not move the placement", {
        reason: "E_ACTOR_FORBIDDEN" as const,
        which: "not-party" as const,
      });
  }
  if (actor.kind === "system" && !(spec.systemJobs ?? []).includes(actor.id))
    return err("FORBIDDEN", "This actor may not move the placement", {
      reason: "E_ACTOR_FORBIDDEN" as const,
      which: "job-not-named" as const,
    });
  return ok(undefined);
}

function checkFrom(
  spec: TransitionSpec,
  input: Input,
  current: PlacementState | null,
): Result<"proceed" | "noop"> {
  if (input.expectedFrom !== current)
    return err("CONFLICT", "The placement has moved since you read it", {
      reason: "E_STALE_STATE" as const,
      which: "expectedFrom",
    });
  if (spec.from.includes(current)) return ok("proceed");
  if (current === spec.to)
    return spec.idempotency === "reject"
      ? err("CONFLICT", "The placement has moved since you read it", {
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

export const PLACEMENT_GUARDS = Object.freeze({
  checkActor,
  checkFrom,
  precondition: (which: string) =>
    err("CONFLICT", "The placement cannot move yet", {
      reason: "E_PRECONDITION_FAILED" as const,
      which,
    }),
  invalidPayload: (which: string) =>
    err("VALIDATION", "The transition payload is not what the row carries", {
      reason: "E_PAYLOAD_INVALID" as const,
      which,
    }),
  notFound: () =>
    err("NOT_FOUND", "No such placement", {
      reason: "E_ENTITY_NOT_FOUND" as const,
      entity: "placement" as const,
    }),
});
