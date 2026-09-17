// A slot's start as the words a parent reads (04 §7.1 row 3: "Tue 16 Sep, 2:00pm London time"; 04 §6.2
// S-P-02: the option's accessible name is the full date + time + "London time"). Locale and timezone from
// config (L4); `Intl` owns the DST question, so 14:00 in July and 14:00 in January both read "2:00pm".
import { LOCALE } from "@/modules/config";
import type { ISO } from "@/modules/shared-types";
import type { LondonSlotWords } from "../types";

const SHORT = new Intl.DateTimeFormat(LOCALE.locale, {
  timeZone: LOCALE.timezone,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const FULL = new Intl.DateTimeFormat(LOCALE.locale, {
  timeZone: LOCALE.timezone,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const TIME = new Intl.DateTimeFormat(LOCALE.locale, {
  timeZone: LOCALE.timezone,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const part = (parts: Intl.DateTimeFormatPart[], type: string): string =>
  parts.find((each) => each.type === type)?.value ?? "";

/** "2:00 pm" → "2:00pm" — the 04 §7.1 spelling. */
const compactTime = (at: Date): string =>
  TIME.format(at).replace(/\s+/g, "").toLowerCase();

export function londonSlotWords(start: ISO): LondonSlotWords {
  const at = new Date(start);
  const short = SHORT.formatToParts(at);
  const full = FULL.formatToParts(at);
  const time = compactTime(at);
  const shortDate = `${part(short, "day")} ${part(short, "month")}`;
  const fullDate = `${part(full, "day")} ${part(full, "month")}`;
  return Object.freeze({
    weekday: part(full, "weekday"),
    date: fullDate,
    time,
    short: `${part(short, "weekday")} ${shortDate}, ${time} London time`,
    full: `${part(full, "weekday")} ${fullDate}, ${time} London time`,
  });
}
