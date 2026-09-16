// A London wall clock (`YYYY-MM-DD` + `HH:mm`) as the UTC instant it names (03 §3.3 I-6: "a slot's start is
// that wall-clock's UTC instant"). Two passes, because the offset that applies is the one *at* the instant,
// not at the naive guess: the second pass catches a guess that landed on the far side of a transition.
import { londonOffsetMinutes } from "./london-offset-minutes";

const MINUTE_MS = 60_000;

export function londonInstant(isoDate: string, localTime: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const naive = Date.UTC(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    hour ?? 0,
    minute ?? 0,
  );
  const first = naive - londonOffsetMinutes(new Date(naive)) * MINUTE_MS;
  const second = naive - londonOffsetMinutes(new Date(first)) * MINUTE_MS;
  return new Date(second).toISOString();
}
