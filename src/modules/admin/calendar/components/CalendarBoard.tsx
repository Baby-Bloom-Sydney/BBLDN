"use client";
// S-A-03's calendar (04 §6.4; ADR-074 put it on the same screen as the list).
//
// Semantics (fix: a11y-7 / a11y-8 / a11y-10): each day is a `fieldset` whose `legend` is the full date, each
// cell carries its own full accessible name with `<time datetime>`, a nanny-held cell says so **in words**
// rather than by colour, and the block control is a labelled form whose result takes focus as an alert.
//
// Two things the screen states plainly rather than hiding:
//   · a block **flags** the bookings inside it and never cancels them (ADR-077) — the count is shown;
//   · `unblock` is not built, so a block laid here stands until the next release (see
//     `scheduling/lib/scheduling-admin-writes.ts` for why no write available today can lift one).
import { useCallback, useState } from "react";
import type { ISO } from "@/modules/shared-types";
import type { CalendarActions, CalendarView } from "../types";

const CELL_STATE_TEXT: Readonly<Record<string, string>> = {
  open: "Open",
  displaceable: "Nanny holds this",
  taken: "Taken",
};

export function CalendarBoard({
  view,
  actions,
}: {
  readonly view: CalendarView;
  readonly actions: CalendarActions;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const block = useCallback(async () => {
    if (start === "" || end === "" || reason.trim() === "") {
      setMessage("A block needs a start, an end and a reason.");
      return;
    }
    setBusy(true);
    const blocked = await actions.block({
      start: new Date(start).toISOString() as ISO,
      end: new Date(end).toISOString() as ISO,
      reason: reason.trim(),
    });
    setBusy(false);
    if (!blocked.ok) {
      setMessage("That block did not go through. Try again.");
      return;
    }
    const affected = blocked.value.affected;
    setMessage(
      affected === 0
        ? "Time blocked. No calls were inside it."
        : `Time blocked. ${String(affected)} ${affected === 1 ? "call is" : "calls are"} inside it — they are flagged, not cancelled. Move or clear each one from the call queue.`,
    );
  }, [actions, end, reason, start]);

  return (
    <section aria-labelledby="calendar-heading">
      <h2 id="calendar-heading">Calendar</h2>

      <p>
        {String(view.rules.slotMinutes)}-minute slots, {view.rules.openFrom} to{" "}
        {view.rules.openTo} London time, {view.rules.weekdays},{" "}
        {String(view.rules.horizonDays)} days ahead,{" "}
        {String(view.rules.leadTimeMinutes)} minutes&rsquo; notice, a{" "}
        {String(view.rules.holdMinutes)}-minute hold.
      </p>

      <form aria-labelledby="block-heading">
        <h3 id="block-heading">Block time</h3>
        <label htmlFor="block-start">From</label>
        <input
          id="block-start"
          type="datetime-local"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
        <label htmlFor="block-end">To</label>
        <input
          id="block-end"
          type="datetime-local"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
        <label htmlFor="block-reason">Reason</label>
        <input
          id="block-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <button type="button" disabled={busy} onClick={block}>
          Block this time
        </button>
        <p>
          A block never cancels a call that is already in it — the call is
          flagged for you to move or clear. Lifting a block again is not
          available yet.
        </p>
      </form>

      {message === null ? null : <p role="alert">{message}</p>}

      {view.days.length === 0 ? (
        <p>
          No time is open in the next {String(view.rules.horizonDays)} days.
        </p>
      ) : (
        view.days.map((day) => (
          <fieldset key={day.date}>
            <legend>{day.legend}</legend>
            {day.slots.map((cell) => (
              <p key={cell.slotId}>
                <time dateTime={cell.start}>{cell.time}</time> —{" "}
                {CELL_STATE_TEXT[cell.state] ?? cell.state}
                <span className="sr-only"> {cell.label}</span>
              </p>
            ))}
          </fieldset>
        ))
      )}
    </section>
  );
}
