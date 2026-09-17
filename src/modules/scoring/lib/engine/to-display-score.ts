// The three layers → the display range (03 §7.1 "mapped to a display range"): raw = base × penalty × bonus on a
// 0–100 scale, then linearly into `[displayRange.min, displayRange.max]`, rounded, never outside the range.
import type { MatchingConfig } from "../../types";

const RAW_MAX = 100;

export function toDisplayScore(raw: number, config: MatchingConfig): number {
  const { min, max } = config.displayRange;
  const clamped = Math.max(0, Math.min(RAW_MAX, raw));
  return Math.round(min + (clamped / RAW_MAX) * (max - min));
}
