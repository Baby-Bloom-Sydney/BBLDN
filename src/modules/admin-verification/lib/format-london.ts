// A timestamp as the admin reads it: Europe/London, en-GB, date + time (04 §6.4 "Europe/London" on every admin
// screen). Pure; the zone and locale are config, never literals.
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
