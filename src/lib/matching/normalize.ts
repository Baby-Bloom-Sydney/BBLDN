// ── Data normalization & distance utilities ──

import { NANNY_BLOCK_MAP } from './constants';

// Time block boundaries (24h)
const BLOCKS = [
  { name: 'morning', start: 6, end: 10 },
  { name: 'midday', start: 10, end: 14 },
  { name: 'afternoon', start: 14, end: 18 },
  { name: 'evening', start: 18, end: 22 },
] as const;

/** Convert "HH:MM" to decimal hours */
function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h + (m || 0) / 60;
}

/** Convert a start/end time range to matching block names */
function timeRangeToBlocks(start: string, end: string): string[] {
  const s = parseTime(start);
  const e = parseTime(end);
  return BLOCKS.filter((b) => s < b.end && e > b.start).map((b) => b.name);
}

/**
 * Normalize nanny availability schedule to parent's block format ("morning", "midday", etc).
 * Handles two DB formats:
 *   Format 1 (labels):   { monday: ["Morning (6am-10am)", ...] }
 *   Format 2 (times):    { monday: { start: "07:30", end: "17:30", available: true } }
 */
export function normalizeNannySchedule(
  schedule: Record<string, unknown> | null
): Record<string, string[]> {
  if (!schedule) return {};

  const normalized: Record<string, string[]> = {};
  for (const [day, value] of Object.entries(schedule)) {
    const dayKey = day.toLowerCase();

    if (Array.isArray(value)) {
      // Format 1: array of label strings
      normalized[dayKey] = (value as string[])
        .map((b) => NANNY_BLOCK_MAP[b] || b.toLowerCase().split(' ')[0])
        .filter(Boolean);
    } else if (
      value &&
      typeof value === 'object' &&
      'available' in value
    ) {
      // Format 2: { start, end, available }
      const obj = value as { start: string | null; end: string | null; available: boolean };
      if (obj.available && obj.start && obj.end) {
        normalized[dayKey] = timeRangeToBlocks(obj.start, obj.end);
      }
    }
  }
  return normalized;
}

type Coord = [number, number]; // [lat, lon]

/** Raw haversine (straight-line) distance in km */
function rawHaversine(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a[0])) *
      Math.cos(toRad(b[0])) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine (straight-line) distance in kilometres between two lat/lng pairs. */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return rawHaversine([lat1, lon1], [lat2, lon2]);
}

/**
 * Calculate the age in years from a date_of_birth string.
 * Returns null if DOB is missing or invalid.
 */
export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
