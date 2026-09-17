"use client";
// S-P-02 — the slot picker (04 §6.2; ADR-073 / ADR-076). One `radiogroup` per London day inside a `fieldset`
// whose `legend` is the full date; every option's accessible name is the full date + time + "London time" with
// a `<time datetime>`; native radios give Tab between days and arrow keys within one (fix: a11y-2 / a11y-3).
// Tap = hold; the button = the write. A taken slot or a run-out hold says so in an assertive region that takes
// focus, and she picks again (fix: a11y-1). The actions are props so this client bundle never reaches a
// connector barrel (01 §2.5).
import { useCallback, useEffect, useRef, useState } from "react";
import type { HoldId, ISO, SlotId } from "@/modules/shared-types";
import type { SlotDay, SlotPickerProps } from "../types";
import { londonSlotWords } from "../lib/london-slot-words";

const GONE = "That time has just gone — pick another.";
const RAN_OUT = "Your hold ran out — pick again.";
const NOT_SET = "We couldn't set that time — try again.";
const NONE = "No times to pick right now — your matchmaker will call you.";
const LOAD_FAILED =
  "We couldn't load the times — your matchmaker will still call you.";

const option =
  "cursor-pointer select-none rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors peer-checked:border-violet-500 peer-checked:bg-violet-50 peer-checked:text-violet-700 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-40 hover:border-slate-300";

const button =
  "inline-flex items-center justify-center rounded-md bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const quiet =
  "text-sm font-medium text-violet-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2";

const messageFor = (reason: unknown): string => {
  if (reason === "SLOT_TAKEN" || reason === "NOT_IMPLEMENTED") return GONE;
  if (reason === "HOLD_EXPIRED" || reason === "HOLD_NOT_YOURS") return RAN_OUT;
  return NOT_SET;
};

type Picked = { readonly slotId: SlotId; readonly holdId?: HoldId };

function DayGroup({
  day,
  picked,
  gone,
  disabled,
  onPick,
}: {
  readonly day: SlotDay;
  readonly picked: Picked | null;
  readonly gone: ReadonlySet<SlotId>;
  readonly disabled: boolean;
  readonly onPick: (slotId: SlotId) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-slate-900">
        {day.legend}
      </legend>
      <div
        role="radiogroup"
        aria-label={`${day.legend}, London time`}
        className="mt-3 flex flex-wrap gap-2"
      >
        {day.slots.map((slot) => {
          const isGone = gone.has(slot.id);
          return (
            <span key={slot.id} className="inline-flex">
              <input
                type="radio"
                id={slot.id}
                name={`day-${day.isoDate}`}
                value={slot.id}
                className="peer sr-only"
                checked={picked?.slotId === slot.id}
                disabled={disabled || isGone}
                aria-disabled={isGone || undefined}
                aria-label={
                  isGone ? `${slot.name} — no longer available` : slot.name
                }
                onChange={() => onPick(slot.id)}
              />
              <label htmlFor={slot.id} className={option}>
                <time dateTime={slot.start}>{slot.time}</time>
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}

function ChosenLine({
  start,
  onChange,
  dashboardHref,
}: {
  readonly start: ISO;
  readonly onChange: () => void;
  readonly dashboardHref: string;
}) {
  const words = londonSlotWords(start);
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-green-900">
      <p className="text-base font-semibold">
        We&apos;ll call you {words.weekday} {words.date}, {words.time} London
        time.
      </p>
      <div className="mt-3 flex flex-wrap gap-4">
        <button type="button" onClick={onChange} className={quiet}>
          Change time
        </button>
        <a href={dashboardHref} className={quiet}>
          Back to your steps
        </a>
      </div>
    </div>
  );
}

export function SlotPicker({
  positionId,
  days: initialDays,
  chosen,
  actions,
  dashboardHref,
}: SlotPickerProps) {
  const [days, setDays] = useState<ReadonlyArray<SlotDay> | null>(initialDays);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [gone, setGone] = useState<ReadonlySet<SlotId>>(() => new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [done, setDone] = useState<ISO | null>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message !== null) alertRef.current?.focus();
  }, [message]);

  const reload = useCallback(async () => {
    setBusy(true);
    const listed = await actions.list();
    setBusy(false);
    if (listed.ok) {
      setDays(listed.value);
      setGone(new Set());
      return;
    }
    setDays(null);
    setMessage(LOAD_FAILED);
  }, [actions]);

  const pick = useCallback(
    async (slotId: SlotId) => {
      setMessage(null);
      setPicked({ slotId });
      const held = await actions.hold(slotId, positionId);
      if (held.ok) {
        setPicked({ slotId, holdId: held.value.holdId });
        return;
      }
      setPicked(null);
      setGone((previous) => new Set([...previous, slotId]));
      setMessage(messageFor(held.error.details?.reason));
    },
    [actions, positionId],
  );

  const confirm = useCallback(async () => {
    if (picked === null) return;
    setBusy(true);
    const result = await actions.choose({ positionId, ...picked });
    setBusy(false);
    if (result.ok) {
      setDone(result.value.start);
      setChanging(false);
      setPicked(null);
      return;
    }
    const reason = result.error.details?.reason;
    if (reason === "SLOT_TAKEN" || reason === "NOT_IMPLEMENTED")
      setGone((previous) => new Set([...previous, picked.slotId]));
    setPicked(null);
    setMessage(messageFor(reason));
  }, [actions, picked, positionId]);

  const standing = done ?? chosen?.start ?? null;
  if (standing !== null && !changing)
    return (
      <div>
        {done !== null && (
          <p role="status" className="sr-only">
            Done — we&apos;ll call you {londonSlotWords(done).full}.
          </p>
        )}
        <ChosenLine
          start={standing}
          onChange={() => setChanging(true)}
          dashboardHref={dashboardHref}
        />
      </div>
    );

  return (
    <section aria-labelledby="slot-picker-heading" aria-busy={busy}>
      <h2
        id="slot-picker-heading"
        className="text-lg font-semibold text-slate-900"
      >
        Pick a time for your call
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        All times are London time. Tap a time to hold it, then confirm below.
      </p>
      {message !== null && (
        <p
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {message}
        </p>
      )}
      {days === null || days.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm text-slate-700">
            {days === null ? LOAD_FAILED : NONE}
          </p>
          <button
            type="button"
            onClick={reload}
            disabled={busy}
            className={`mt-3 ${quiet}`}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {days.map((day) => (
            <DayGroup
              key={day.isoDate}
              day={day}
              picked={picked}
              gone={gone}
              disabled={busy}
              onPick={pick}
            />
          ))}
        </div>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={confirm}
          disabled={busy || picked === null}
          className={button}
        >
          Book my call
        </button>
        {changing && (
          <button
            type="button"
            onClick={() => setChanging(false)}
            className={quiet}
          >
            Keep my time
          </button>
        )}
      </div>
    </section>
  );
}
