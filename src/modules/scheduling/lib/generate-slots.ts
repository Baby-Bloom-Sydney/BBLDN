// 03 §3.6 — slot generation as a pure function, shared by `scheduling.stub.ts` and the real inside so the
// window (I-7), the grid and the DST rule (I-6) have one home. Rules are London wall clock; the returned
// `start` is the UTC instant that wall clock names.
//
// **Weekday convention: Monday = 0**, per 02 §4.4 (`availability_rules.weekday`), which owns the column.
// `config/scheduling.ts` comments its seed array as `0 = Sunday`; the mismatch is a recorded foundations gap
// (README "Gaps") and is not silently reconciled here.
import type {
  AvailabilityRule,
  ISO,
  Slot,
  SlotId,
} from "@/modules/shared-types";
import { londonInstant } from "./london-instant";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const londonWeekday = (isoDate: string): number =>
  (new Date(`${isoDate}T12:00:00Z`).getUTCDay() + 6) % 7;

const minutesOf = (localTime: string): number => {
  const [hour, minute] = localTime.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
};

const asLocalTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const appliesOn = (rule: AvailabilityRule, isoDate: string): boolean =>
  rule.weekday === londonWeekday(isoDate) &&
  (rule.effectiveFrom === undefined || isoDate >= rule.effectiveFrom) &&
  (rule.effectiveTo === undefined || isoDate <= rule.effectiveTo);

export function generateSlots(input: {
  readonly rules: ReadonlyArray<AvailabilityRule>;
  readonly from: ISO;
  readonly to: ISO;
  readonly slotMinutes: number;
}): ReadonlyArray<Slot> {
  const first = Date.parse(input.from);
  const last = Date.parse(input.to);
  const dates: string[] = [];
  for (let day = first - DAY_MS; day <= last + DAY_MS; day += DAY_MS) {
    dates.push(new Date(day).toISOString().slice(0, 10));
  }
  return dates.flatMap((isoDate) =>
    input.rules
      .filter((rule) => appliesOn(rule, isoDate))
      .flatMap((rule) => {
        const slots: Slot[] = [];
        const end = minutesOf(rule.endLocal);
        for (
          let at = minutesOf(rule.startLocal);
          at + input.slotMinutes <= end;
          at += input.slotMinutes
        ) {
          const start = londonInstant(isoDate, asLocalTime(at));
          const startMs = Date.parse(start);
          if (startMs < first || startMs > last) continue;
          slots.push({
            id: `default:${start}` as SlotId,
            calendarId: "default",
            start: start as ISO,
            end: new Date(
              startMs + input.slotMinutes * MINUTE_MS,
            ).toISOString() as ISO,
            displaceable: false,
          });
        }
        return slots;
      }),
  );
}
