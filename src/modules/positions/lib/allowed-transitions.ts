// 03 §2.5 `listAllowed` — the admin levers and user buttons for one entity at one stage. Pure filter over a
// `TransitionSpec` table: the row's `from` must contain the current stage, and the 03 §2.5 actor rule must let
// this actor fire it (a user only on rows naming their role and only on an entity they are party to; a system
// job only where its name is listed).
//
// Returning the ids directly (no `Result`, as the contract has it) means the only honest answer to "I could not
// read that" is **no levers** — a button that is absent, never a button that moves a stage nothing is behind.
import type {
  Actor,
  ParentId,
  Stage,
  TransitionId,
  TransitionMover,
  TransitionSpec,
} from "@/modules/shared-types";

const moverOf = (actor: Actor): TransitionMover => {
  if (actor.kind === "admin") return "admin";
  if (actor.kind === "system") return "system";
  return actor.role === "parent" ? "user:parent" : "user:nanny";
};

export function allowedTransitions(
  table: ReadonlyArray<TransitionSpec>,
  stage: Stage,
  actor: Actor,
  owner: ParentId,
): ReadonlyArray<TransitionId> {
  const mover = moverOf(actor);
  const isOwner =
    actor.kind !== "user" ||
    actor.role !== "parent" ||
    (actor.id as string) === (owner as string);
  return Object.freeze(
    table
      .filter(
        (spec) =>
          spec.from.includes(stage) &&
          spec.movers.includes(mover) &&
          isOwner &&
          (actor.kind !== "system" ||
            (spec.systemJobs ?? []).includes(actor.id)),
      )
      .map((spec) => spec.id),
  );
}
