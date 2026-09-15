// 01 §3.1 — calendar seed values (ADR-076: 30 min · 09:00–19:00 · Mon–Fri · 14 d · 120 min · 300 s), all editable in
// the admin at runtime; shape = 03 §3.2 `ScheduleConfig` + the seed rules + the I-13 cap. Timezone from LOCALE.
import { LOCALE } from "./locale";

export const SCHEDULING = Object.freeze({
  slotMinutes: 30,
  hours: Object.freeze({ startLocal: "09:00", endLocal: "19:00" }),
  weekdays: Object.freeze([1, 2, 3, 4, 5] as const), // Mon–Fri (0 = Sunday)
  horizonDays: 14, // 01 §3.1 calls it bookAheadDays; 03 §3.2 `horizonDays` is the contract name
  leadTimeMinutes: 120, // 01 §3.1 minNoticeMinutes
  holdTtlSeconds: 300,
  reminderOffsetsMinutes: Object.freeze([1440] as const), // customer 24 h (+ 1 h optional) @pending:B-08
  adminReminderMinutes: 15, // @pending:B-08
  overdueGraceMinutes: 15, // @pending:B-08
  maxDisplacementsPerNannyPerDay: 2, // 03 §3.3 I-13 @pending:B-07
  alertAtDisplacementCap: true, // @pending:B-07
  maxNoAnswerRetries: 3, // 3 attempts over 2 working days @pending:B-38
  timezone: LOCALE.timezone,
});
