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

// ── Sydney bridge-aware distance calculation ──
//
// Instead of straight-line "as the crow flies", this detects when a path
// crosses major bodies of water (Sydney Harbour, Middle Harbour, Botany Bay)
// using line-segment intersection math, and routes through the nearest
// bridge (Harbour Bridge, Spit Bridge, Roseville Bridge, Captain Cook Bridge).
// This gives realistic travel distances without external routing APIs.

type Coord = [number, number]; // [lat, lon]

// Bridge nodes [lat, lon]
const HARBOUR_BRIDGE: Coord = [-33.8523, 151.2108];
const SPIT_BRIDGE: Coord = [-33.8033, 151.2458];
const ROSEVILLE_BRIDGE: Coord = [-33.7780, 151.2060];
const CAPTAIN_COOK_BRIDGE: Coord = [-34.0018, 151.1305];

// Tripwires: line segments across water bodies.
// If the direct path from A→B crosses a tripwire, the route must go via
// the corresponding bridge.
const TRIPWIRES: { bridge: Coord; lineA: Coord; lineB: Coord }[] = [
  // Main Harbour: Harbour Bridge → Sydney Heads
  { bridge: HARBOUR_BRIDGE, lineA: HARBOUR_BRIDGE, lineB: [-33.8270, 151.2900] },
  // Middle Harbour: Middle Head → Spit Bridge
  { bridge: SPIT_BRIDGE, lineA: [-33.8270, 151.2610], lineB: SPIT_BRIDGE },
  // Upper Middle Harbour: Spit Bridge → Roseville Bridge
  { bridge: ROSEVILLE_BRIDGE, lineA: SPIT_BRIDGE, lineB: ROSEVILLE_BRIDGE },
  // Botany Bay: Captain Cook Bridge → Botany Bay Heads
  { bridge: CAPTAIN_COOK_BRIDGE, lineA: CAPTAIN_COOK_BRIDGE, lineB: [-33.9980, 151.2260] },
];

/** Counter-clockwise orientation test */
function ccw(A: Coord, B: Coord, C: Coord): boolean {
  return (C[0] - A[0]) * (B[1] - A[1]) > (B[0] - A[0]) * (C[1] - A[1]);
}

/** Do line segments AB and CD intersect? */
function segmentsIntersect(A: Coord, B: Coord, C: Coord, D: Coord): boolean {
  return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);
}

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

/** Find shortest permutation of waypoints between start and end */
function shortestThroughWaypoints(
  start: Coord,
  end: Coord,
  waypoints: Coord[]
): number {
  if (waypoints.length === 0) return rawHaversine(start, end);
  if (waypoints.length === 1) {
    return rawHaversine(start, waypoints[0]) + rawHaversine(waypoints[0], end);
  }

  // Max 4 bridges → 24 permutations at most — trivial to brute-force
  let best = Infinity;
  const perms = permutations(waypoints);
  for (const order of perms) {
    let d = rawHaversine(start, order[0]);
    for (let i = 1; i < order.length; i++) {
      d += rawHaversine(order[i - 1], order[i]);
    }
    d += rawHaversine(order[order.length - 1], end);
    if (d < best) best = d;
  }
  return best;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      result.push([arr[i], ...perm]);
    }
  }
  return result;
}

/**
 * Bridge-aware haversine distance in kilometres between two lat/lng pairs.
 * Detects water crossings in Eastern Sydney and routes through the
 * appropriate bridge(s). Drop-in replacement — same signature as before.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const start: Coord = [lat1, lon1];
  const end: Coord = [lat2, lon2];

  // Collect bridges needed for water crossings
  const bridges: Coord[] = [];
  for (const tw of TRIPWIRES) {
    if (segmentsIntersect(start, end, tw.lineA, tw.lineB)) {
      bridges.push(tw.bridge);
    }
  }

  if (bridges.length === 0) return rawHaversine(start, end);

  // Deduplicate (a bridge could theoretically appear twice)
  const unique = bridges.filter(
    (b, i) => bridges.findIndex((x) => x[0] === b[0] && x[1] === b[1]) === i
  );

  return shortestThroughWaypoints(start, end, unique);
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
