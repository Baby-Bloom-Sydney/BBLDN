// Minutes east of UTC in `LOCALE.timezone` at a given instant. The only place the DST question is asked
// (03 §3.3 I-6): London is +60 through BST and 0 through GMT, and `Intl` owns the transition dates so this
// module never carries a table that could go stale.
import { LOCALE } from "@/modules/config";

const FORMATTER = new Intl.DateTimeFormat(LOCALE.locale, {
  timeZone: LOCALE.timezone,
  timeZoneName: "longOffset",
});

export function londonOffsetMinutes(at: Date): number {
  const name =
    FORMATTER.formatToParts(at).find((part) => part.type === "timeZoneName")
      ?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):(\d{2})/u.exec(name);
  if (match === null) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}
