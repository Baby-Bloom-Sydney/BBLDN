// 03 §8.1's first rendering helper. Comms renders in the one locale and the one timezone, both read from
// `LOCALE` and never typed here — the config-literal gate reddens either as a literal outside `config` (L4).
//
// One formatter, built once: `Intl.DateTimeFormat` is expensive to construct and a template may render it per
// row of a batch.
//
// **It takes `unknown`, and that is the contract rather than a shrug.** A template is handed `TemplateData`,
// which 03 §8.1 leaves as an open record until each registry entry narrows its own payload (README gap 3), so
// what actually reaches this helper is `unknown` — a caller could pass a number, a null, or nothing at all.
// The first version took `IsoInstant | undefined` and every caller crossed the brand with `as never`, which is
// the P4-GATES rule's exact target: `never` is assignable to everything, so the cast asserted the value was an
// instant while proving nothing, on a value read out of an open record. Widening the parameter to what callers
// genuinely hold deletes both casts and moves no risk — the function already answered `""` for anything it
// could not parse, and that is now the answer for anything it is not given.
//
// When a template narrows its own `TemplateRegistry` entry, its field is a real `IsoInstant` and this signature
// still accepts it. The narrowing is the fix that makes the type meaningful; the cast never was.
import { LOCALE } from "@/modules/config";

const FORMATTER = new Intl.DateTimeFormat(LOCALE.locale, {
  timeZone: LOCALE.timezone,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/** Anything that is not a parseable instant renders as the empty string, never `Invalid Date` in someone's inbox. */
export function formatLondonDateTime(instant: unknown): string {
  if (typeof instant !== "string") return "";
  const at = new Date(instant);
  return Number.isNaN(at.getTime()) ? "" : FORMATTER.format(at);
}
