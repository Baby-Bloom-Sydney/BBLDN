// `stubDistanceProvider` (03 §7.5) — deterministic distance with no geography behind it: `0` when the districts
// match, else `(hash % 30) + 1`; a fixture may override any pair. Deterministic by construction (03 §7.3 rule:
// no `Date.now()`), so swap test 6 can compare real against stub without a tolerance.
import type { AreaRef, DistanceProvider } from "../types";

const MAX_STUB_KM = 30;

/** Fixture overrides, keyed `"<from district>|<to district>"` — symmetric, checked both ways. */
export type DistanceFixtures = Readonly<Record<string, number | null>>;

const hashOf = (value: string): number => {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) % 1_000_003;
  }
  return hash;
};

export function stubDistanceProvider(
  fixtures: DistanceFixtures = {},
): DistanceProvider {
  return Object.freeze({
    kind: "stub" as const,
    distanceKm: async (a: AreaRef, b: AreaRef) => {
      // `null` is a meaningful override ("distance unknown"), so the lookup tests for the key, never for a
      // falsy value — `??` would have swallowed it.
      const forward = `${a.district}|${b.district}`;
      const reverse = `${b.district}|${a.district}`;
      const key = forward in fixtures ? forward : reverse;
      if (key in fixtures)
        return { ok: true as const, value: fixtures[key] ?? null };
      if (a.district === b.district) return { ok: true as const, value: 0 };
      const pair = [a.district, b.district].sort().join("|");
      return {
        ok: true as const,
        value: (hashOf(pair) % MAX_STUB_KM) + 1,
      };
    },
  });
}
