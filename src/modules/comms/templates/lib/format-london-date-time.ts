// 03 §8.1's first rendering helper. Comms renders in the one locale and the one timezone, both read from
// `LOCALE` and never typed here — the config-literal gate reddens either as a literal outside `config` (L4).
//
// One formatter, built once: `Intl.DateTimeFormat` is expensive to construct and a template may render it per
// row of a batch.
import { LOCALE } from "@/modules/config";
import type { IsoInstant } from "@/modules/shared-types";

const FORMATTER = new Intl.DateTimeFormat(LOCALE.locale, {
  timeZone: LOCALE.timezone,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/** An instant a template cannot parse renders as the empty string rather than `Invalid Date` in someone's inbox. */
export function formatLondonDateTime(instant: IsoInstant | undefined): string {
  if (instant === undefined) return "";
  const at = new Date(instant);
  return Number.isNaN(at.getTime()) ? "" : FORMATTER.format(at);
}
