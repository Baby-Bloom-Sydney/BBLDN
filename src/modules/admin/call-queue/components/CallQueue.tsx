"use client";
// S-A-03 — the call queue (04 §6.4).
//
// Semantics are the row's own (fix: a11y-7 / a11y-8 / a11y-9 / a11y-10): a **table** with a `<caption>`,
// `th scope`, `aria-sort` on the time column, the row count announced when the filter changes, **type and
// priority as visible text** ("Priority: parent · Matchmaking") rather than colour, and every action a real
// button. The drawer traps focus and returns it to the row that opened it (S-A-04, `CallItemDrawer`).
//
// The absence `1f` stated on this screen is gone (`1g`): a call that has never had a time set is now listed,
// under "Waiting for a time", from `callLayer.listOpenCalls` (03 §3.6). Those rows have no booking, so they
// have no time column and no outcome — the one action they carry is the one that applies, setting a time on
// the family's behalf.
import { useCallback, useMemo, useRef, useState } from "react";
import type { CallType } from "@/modules/shared-types";
import type {
  AwaitingCallRow,
  CallQueueActions,
  CallQueueRow,
  CallQueueView,
} from "../types";
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
  const awaiting = useMemo(
    () => view.awaiting.filter((row) => type === "all" || row.type === type),
    [view.awaiting, type],
  );
  const shown =
    groups.reduce((count, group) => count + group.rows.length, 0) +
    awaiting.length;

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

      <AwaitingCalls rows={awaiting} />

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

/**
 * The calls with no booking behind them (03 §3.6). Its own table, because its columns are different ones: a
 * call that has never had a time has no time, no priority lane and no outcome — it has a family who has been
 * waiting since a known instant, and 03 §2.2's promise that we ring anyway.
 *
 * A retry after a no-answer is named as one (R5), because an admin who does not know that is about to ring a
 * number that already did not answer.
 */
function AwaitingCalls({
  rows,
}: {
  readonly rows: ReadonlyArray<AwaitingCallRow>;
}) {
  return (
    <table>
      <caption>Waiting for a time — {String(rows.length)}</caption>
      <thead>
        <tr>
          <th scope="col">Asked for (London)</th>
          <th scope="col">Call</th>
          <th scope="col">About</th>
          <th scope="col">State</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4}>No families are waiting for a time.</td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.positionId}>
              <th scope="row">
                <time dateTime={row.requestedAt}>{row.requestedWhen}</time>
              </th>
              <td>{CALL_TYPE_LABEL[row.type]}</td>
              <td>
                {row.about}
                {row.aboutNanny === undefined
                  ? null
                  : ` · about ${row.aboutNanny}`}
              </td>
              <td>
                No time set
                {row.noAnswerCount === 0
                  ? ""
                  : ` · no answer ${String(row.noAnswerCount)}\u00d7 — ring again`}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
