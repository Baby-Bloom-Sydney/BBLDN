"use client";
// S-A-04 — the call item (04 §6.4). A modal drawer with a focus trap; focus returns to the row that opened it
// (fix: a11y-9), which `CallQueue` does on close.
//
// The four levers 04 §6.4 names: **mark done with an outcome**, **no answer with a next attempt**, **move the
// slot** and **clear it** — all through `admin-on-behalf` (FIX-1). No-answer is not a separate control: it is
// one of 03 §2.7's outcomes, and `call-layer` turns it into C-5 rather than C-3, so the call goes back to
// `awaiting-slot` for the retry (R5; ADR-073). The screen says that in words after it is recorded.
//
// What is **not** here, and why: the parent's name and phone number. 04 §6.4 asks for "parent + contact", and
// `admin` may not read a table (fix: A-11 / A-24) while neither `auth` nor `positions` exposes a person by id.
// Recorded and pinned rather than reached around.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CallOutcome, SlotId } from "@/modules/shared-types";
import type { CallPartyRef, CallQueueActions, CallQueueRow } from "../types";
import { CALL_OUTCOME_LABEL } from "../lib/call-outcome-label";
import { CALL_TYPE_LABEL } from "../lib/call-type-label";

const OUTCOMES: ReadonlyArray<CallOutcome> = [
  "proceeding",
  "not-now",
  "not-proceeding",
  "no-answer",
  "cancelled",
];

const partyRefOf = (row: CallQueueRow): CallPartyRef | null => {
  if (row.subject.kind === "nanny")
    return {
      kind: "nanny",
      bookingId: row.bookingId,
      nannyId: row.subject.nannyId,
    };
  return row.parentId === undefined
    ? null
    : {
        kind: "position",
        positionId: row.subject.positionId,
        parentId: row.parentId,
      };
};

export function CallItemDrawer({
  row,
  actions,
  onClose,
}: {
  readonly row: CallQueueRow;
  readonly actions: CallQueueActions;
  readonly onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome>("proceeding");
  const [notes, setNotes] = useState("");
  const [slot, setSlot] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = partyRefOf(row);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const run = useCallback(
    async (work: () => Promise<{ readonly ok: boolean }>, done: string) => {
      setBusy(true);
      const result = await work();
      setBusy(false);
      setMessage(result.ok ? done : "That did not go through. Try again.");
    },
    [],
  );

  const recordOutcome = useCallback(async () => {
    if (ref === null) return;
    await run(
      () =>
        actions.recordOutcome({
          ref,
          outcome,
          ...(notes.trim() === "" ? {} : { notes: notes.trim() }),
        }),
      outcome === "no-answer"
        ? "No answer recorded. The call is back to waiting for a time — book the next attempt below."
        : `Recorded: ${CALL_OUTCOME_LABEL[outcome]}.`,
    );
  }, [actions, notes, outcome, ref, run]);

  const move = useCallback(async () => {
    if (ref === null || slot.trim() === "") return;
    await run(
      () => actions.move({ ref, slotId: slot.trim() as SlotId }),
      "Time moved. The family has been told.",
    );
  }, [actions, ref, run, slot]);

  const book = useCallback(async () => {
    if (ref === null || ref.kind !== "position" || slot.trim() === "") return;
    await run(
      () =>
        actions.book({
          positionId: ref.positionId,
          parentId: ref.parentId,
          slotId: slot.trim() as SlotId,
        }),
      "Time booked on her behalf.",
    );
  }, [actions, ref, run, slot]);

  const clear = useCallback(async () => {
    if (ref === null || ref.kind !== "position") return;
    await run(
      () =>
        actions.clear({ positionId: ref.positionId, parentId: ref.parentId }),
      "Time cleared. The family has been told.",
    );
  }, [actions, ref, run]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="call-item-heading">
      <h2 id="call-item-heading" tabIndex={-1} ref={heading}>
        {CALL_TYPE_LABEL[row.type]} call — {row.when}
      </h2>
      <p>{row.about}</p>
      <p>
        State: {row.state}
        {row.outcome === undefined
          ? null
          : ` · ${CALL_OUTCOME_LABEL[row.outcome]}`}
      </p>
      <p>
        The family&rsquo;s name and number are not on this screen yet — open her
        from Positions.
      </p>

      {ref === null ? (
        <p role="alert">
          This call cannot be worked from here: its position could not be read.
        </p>
      ) : (
        <>
          <fieldset>
            <legend>Mark the call done</legend>
            <label htmlFor="call-outcome">Outcome</label>
            <select
              id="call-outcome"
              value={outcome}
              onChange={(event) =>
                setOutcome(event.target.value as CallOutcome)
              }
            >
              {OUTCOMES.map((each) => (
                <option key={each} value={each}>
                  {CALL_OUTCOME_LABEL[each]}
                </option>
              ))}
            </select>
            <label htmlFor="call-notes">Note</label>
            <textarea
              id="call-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <button type="button" disabled={busy} onClick={recordOutcome}>
              Record the outcome
            </button>
          </fieldset>

          <fieldset>
            <legend>Time</legend>
            <label htmlFor="call-slot">Slot</label>
            <input
              id="call-slot"
              value={slot}
              onChange={(event) => setSlot(event.target.value)}
              placeholder="default:2026-01-09T10:00:00.000Z"
            />
            <button type="button" disabled={busy} onClick={move}>
              Move the time
            </button>
            {ref.kind === "position" ? (
              <>
                <button type="button" disabled={busy} onClick={book}>
                  Set a time on her behalf
                </button>
                <button type="button" disabled={busy} onClick={clear}>
                  Clear the time
                </button>
              </>
            ) : null}
          </fieldset>
        </>
      )}

      {message === null ? null : <p role="alert">{message}</p>}
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
