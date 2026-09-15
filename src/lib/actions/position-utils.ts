import type { TypeformFormData } from '@/app/parent/request/questions';

export const AGE_RANGE_TO_MONTHS: Record<string, number> = {
  '0–3 months': 1,
  '3–6 months': 4,
  '6–12 months': 9,
  '1–2 years': 18,
  '2–3 years': 30,
  '3–4 years': 42,
  '4–5 years': 54,
  '5–10 years': 90,
  '10–13 years': 138,
  '13–16 years': 174,
  '16+': 192,
};

export const HOURS_TO_INT: Record<string, number> = {
  'Under 10': 8,
  '10–20': 15,
  '20–30': 25,
  '30–40': 35,
  '40+': 45,
};

export const DAY_TO_ROSTER_FIELD: Record<string, keyof TypeformFormData> = {
  Monday: 'monday_roster',
  Tuesday: 'tuesday_roster',
  Wednesday: 'wednesday_roster',
  Thursday: 'thursday_roster',
  Friday: 'friday_roster',
  Saturday: 'saturday_roster',
  Sunday: 'sunday_roster',
};

export function buildScheduleJson(
  data: Partial<TypeformFormData>
): Record<string, string[]> {
  const schedule: Record<string, string[]> = {};
  for (const day of data.weekly_roster ?? []) {
    const fieldKey = DAY_TO_ROSTER_FIELD[day];
    if (!fieldKey) continue;
    const times = (data[fieldKey] as string[] | undefined) ?? [];
    if (times.length > 0) {
      schedule[day.toLowerCase()] = times;
    }
  }
  return schedule;
}
