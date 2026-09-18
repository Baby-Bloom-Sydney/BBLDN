// A timestamp as the admin reads it: the config zone and locale, date + time (04 §6.4: every admin screen shows
// the London wall clock). Pure; the zone and locale are `LOCALE`'s, never literals.
import { LOCALE } from "@/modules/config";

const FORMAT = new Intl.DateTimeFormat(LOCALE.locale, {
  timeZone: LOCALE.timezone,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatLondon(instant: string): string {
  return FORMAT.format(new Date(instant));
}
