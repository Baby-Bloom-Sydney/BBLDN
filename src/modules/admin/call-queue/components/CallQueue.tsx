"use client";
// S-A-03 — the call queue (04 §6.4).
//
// Semantics are the row's own (fix: a11y-7 / a11y-8 / a11y-9 / a11y-10): a **table** with a `<caption>`,
// `th scope`, `aria-sort` on the time column, the row count announced when the filter changes, **type and
// priority as visible text** ("Priority: parent · Matchmaking") rather than colour, and every action a real
// button. The drawer traps focus and returns it to the row that opened it (S-A-04, `CallItemDrawer`).
//
// One deliberate absence, stated on the screen: a call that has never had a booking cannot be listed — see
// `types.ts` on `neverBookedUnavailable`. The admin is told, rather than shown an empty group that reads as
// "nothing to do".
import { useCallback, useMemo, useRef, useState } from "react";
import type { CallType } from "@/modules/shared-types";
import type { CallQueueActions, CallQueueRow, CallQueueView } from "../types";
import { CALL_TYPE_LABEL } from "../lib/call-type-label";
import { CALL_OUTCOME_LABEL } from "../lib/call-outcome-label";
import { CallItemDrawer } from "./CallItemDrawer";

const TYPES: ReadonlyArray<CallType | "all"> = [
  "all",
  "matchmaking",
  "onboarding",
  "nanny-commission",
];

const FLAG_TEXT: Readonly<Record<string, string>> = {
  "blocked-over": "Blocked over — move or clear it",
  displaced: "Moved by a family booking",
};

export function CallQueue({
  view,
  actions,
}: {
  readonly view: CallQueueView;
  readonly actions: CallQueueActions;
}) {
  const [type, setType] = useState<CallType | "all">("all");
  const [open, setOpen] = useState<CallQueueRow | null>(null);
  const openedFrom = useRef<HTMLButtonElement | null>(null);

  const groups = useMemo(
    () =>
      view.groups.map((group) => ({
        ...group,
        rows: group.rows.filter((row) => type === "all" || row.type === type),
      })),
    [view.groups, type],
  );
  const shown = groups.reduce((count, group) => count + group.rows.length, 0);

  const openRow = useCallback(
    (row: CallQueueRow, trigger: HTMLButtonElement) => {
      openedFrom.current = trigger;
      setOpen(row);
    },
    [],
  );

  const close = useCallback(() => {
    setOpen(null);
    openedFrom.current?.focus();
  }, []);

  return (
    <section aria-labelledby="call-queue-heading">
      <h1 id="call-queue-heading">Call queue</h1>

      <div>
        <label htmlFor="call-queue-type">Call type</label>
        <select
          id="call-queue-type"
          value={type}
          onChange={(event) => setType(event.target.value as CallType | "all")}
        >
          {TYPES.map((each) => (
            <option key={each} value={each}>
              {each === "all" ? "All types" : CALL_TYPE_LABEL[each]}
            </option>
          ))}
        </select>
      </div>

      {/* a11y-9: the filtered row count is announced, not left to be counted by eye */}
      <p role="status">
        {shown === 1 ? "1 call shown" : `${String(shown)} calls shown`}
      </p>

      <p>
        Calls that have never had a time set are not listed here yet — the call
        state has no store of its own. Open the family from Positions to set one
        on her behalf.
      </p>

      {groups.map((group) => (
        <table key={group.name}>
          <caption>
            {group.heading} — {String(group.rows.length)}
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-sort="ascending">
                Time (London)
              </th>
              <th scope="col">Call</th>
              <th scope="col">About</th>
              <th scope="col">State</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.length === 0 ? (
              <tr>
                <td colSpan={5}>No calls in this group.</td>
              </tr>
            ) : (
              group.rows.map((row) => (
                <tr key={row.bookingId}>
                  <th scope="row">
                    <time dateTime={row.startsAt}>{row.when}</time>
                  </th>
                  <td>
                    {/* visible text, never colour alone (a11y-10) */}
                    {CALL_TYPE_LABEL[row.type]} · Priority: {row.priority}
                  </td>
                  <td>
                    {row.about}
                    {row.flags.map((flag) => (
                      <span key={flag}> · {FLAG_TEXT[flag] ?? flag}</span>
                    ))}
                  </td>
                  <td>
                    {row.state}
                    {row.outcome === undefined
                      ? null
                      : ` · ${CALL_OUTCOME_LABEL[row.outcome]}`}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={(event) => openRow(row, event.currentTarget)}
                    >
                      Open {row.when}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ))}

      {open === null ? null : (
        <CallItemDrawer row={open} actions={actions} onClose={close} />
      )}
    </section>
  );
}
