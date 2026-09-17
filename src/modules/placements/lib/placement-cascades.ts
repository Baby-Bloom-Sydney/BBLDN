// The cascades an L row fires (03 §2.4), run inside the originating `advance` as `{ kind: 'system', id:
// 'cascade' }` and inside the same unit of work.
//
//   **L-1** — none. Its own event is the cascade K-20 fired it for.
//   **L-1b** — K-21 (`CONFIRMED → ACTIVE` on the connection), and `payments.openDfyAccess`: done-for-you app
//   access switches **on** for family and nanny from the nanny's first day, with no trial (ADR-093). That call
//   is a **port**, injected at boot, not an import — `1h` owns the payments inside, and a module that imported
//   a fail-closed binding would make every L-1b fail with it. Until `1h` wires it, access is simply not opened
//   and the row still lands; the event `1h` consumes (`placement.started`) is emitted either way, which is the
//   half `1h` was told to expect.
//   **L-2** — P-6 on the position (`ACTIVE → ENDED`, carrying the reason) and K-23 on the connection
//   (`ACTIVE → FINISHED`). "clears pointers" is the store's, not a transition's.
import { log, ok } from "@/modules/platform";
import type {
  Actor,
  Result,
  StateAfter,
  TransitionId,
  UnitOfWork,
} from "@/modules/shared-types";
import type { PlacementRecord, PlacementsDeps } from "../types";

type Cascaded = StateAfter["cascaded"];

const CASCADE: Actor = Object.freeze({ kind: "system", id: "cascade" });

export async function runPlacementCascades(input: {
  readonly deps: PlacementsDeps;
  readonly id: TransitionId;
  readonly record: PlacementRecord;
  readonly key: string;
  readonly uow: UnitOfWork;
}): Promise<Result<Cascaded>> {
  const { deps, id, record, key, uow } = input;
  if (id === "L-1") return ok([]);

  const connection = { kind: "connection" as const, id: record.connectionId };
  const rows: Array<Cascaded[number]> = [];

  if (id === "L-1b") {
    const started = await deps.advance({
      entity: connection,
      transition: "K-21",
      actor: CASCADE,
      payload: {},
      expectedFrom: "CONFIRMED",
      idempotencyKey: `${key}:K-21`,
      uow,
    });
    if (!started.ok) return started;
    rows.push({
      entity: connection,
      transition: "K-21",
      stage: started.value.stage,
    });

    // ADR-093 / 094. Outside the `uow` on purpose: opening access is another module's write, and a payments
    // failure must not roll back the fact that the nanny started — that fact is the one the whole bundle hangs
    // off. So L-1b still lands on a refusal.
    //
    // ★ **But the refusal is recorded** (REVIEW-2, silent-failure CRITICAL). This used to `await` the call and
    // drop the `Result`: no check, no log, no alert. The comment said the refusal was "left to `1h`'s own
    // retry" — there is no retry. A done-for-you family whose access never opened looked, from every angle an
    // operator has, exactly like one whose access did: the row landed, K-21 fired, `placement.started` was
    // emitted, the request returned 200, and `hasAccess` answered `{ open: false }` for ever with nothing to
    // correlate it to. Alerting is the whole remedy: the money is already taken by this point (ADR-097), so a
    // human has to finish what the port could not.
    if (deps.openDfyAccess !== undefined) {
      const opened = await deps.openDfyAccess({
        parentId: record.parentId,
        placementId: record.placementId,
      });
      if (!opened.ok)
        log.error("L-1b: done-for-you access did not open; the app is off", {
          module: "placements",
          action: "runPlacementCascades",
          alert: "ALERT_DFY_ACCESS_NOT_OPENED",
          transition: "L-1b",
          placementId: record.placementId,
          reason: opened.error.details?.reason ?? opened.error.code,
        });
    }
    return ok(Object.freeze(rows));
  }

  const position = { kind: "position" as const, id: record.positionId };
  const ended = await deps.advance({
    entity: position,
    transition: "P-6",
    actor: CASCADE,
    payload: { endReason: record.endReason },
    expectedFrom: "ACTIVE",
    idempotencyKey: `${key}:P-6`,
    uow,
  });
  if (!ended.ok) return ended;
  rows.push({ entity: position, transition: "P-6", stage: ended.value.stage });

  const finished = await deps.advance({
    entity: connection,
    transition: "K-23",
    actor: CASCADE,
    payload: {},
    expectedFrom: "ACTIVE",
    idempotencyKey: `${key}:K-23`,
    uow,
  });
  if (!finished.ok) return finished;
  rows.push({
    entity: connection,
    transition: "K-23",
    stage: finished.value.stage,
  });

  return ok(Object.freeze(rows));
}
