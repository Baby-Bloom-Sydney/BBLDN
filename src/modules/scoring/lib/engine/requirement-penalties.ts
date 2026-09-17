// Layer 2 (03 §7.1 "hard-requirement penalties (floor)"): each stated requirement the candidate does not meet
// multiplies by `MATCHING.penalties[key]`; the product never drops below `penaltyFloor`; the unmet keys are
// returned so a results card can say what is missing (03 §7.2 `Ranked.unmet`). `nonSmoker` counts but is not
// listed (Sydney's rule carried: it affects the score and is never shown).
import type {
  Candidate,
  MatchingConfig,
  PositionInput,
  Requirements,
} from "../../types";

export type Penalties = {
  readonly multiplier: number;
  readonly unmet: ReadonlyArray<keyof Requirements>;
};

const BOOLEAN_KEYS = [
  "specialNeeds",
  "licence",
  "car",
  "vaccination",
  "pets",
] as const;
const HIDDEN_KEYS: ReadonlySet<keyof Requirements> = new Set(["nonSmoker"]);
const AGE_SEVERE_YEARS = 3;

function ageUnmet(
  wanted: { readonly min?: number; readonly max?: number } | undefined,
  age: number | undefined,
): "mild" | "severe" | null {
  if (wanted?.min === undefined || age === undefined) return null;
  const short = wanted.min - age;
  if (short <= 0) return null;
  return short > AGE_SEVERE_YEARS ? "severe" : "mild";
}

export function requirementPenalties(
  position: PositionInput,
  candidate: Candidate,
  config: MatchingConfig,
): Penalties {
  const wants = position.requirements;
  const has = candidate.attributes;
  const failed: Array<keyof Requirements> = [];
  let multiplier = 1;
  const fail = (key: keyof Requirements, factor: number): void => {
    multiplier *= factor;
    failed.push(key);
  };

  for (const key of BOOLEAN_KEYS)
    if (wants[key] && has[key] !== true) fail(key, config.penalties[key]);
  if (wants.car && !candidate.hasCar && !failed.includes("car"))
    fail("car", config.penalties.car);
  if (wants.nonSmoker && has.nonSmoker !== true)
    fail("nonSmoker", config.penalties.nonSmoker);
  if (
    wants.capacity > 0 &&
    typeof has.capacity === "number" &&
    has.capacity < wants.capacity
  )
    fail("capacity", config.penalties.capacity);
  const age = ageUnmet(wants.nannyAge, candidate.age);
  if (age === "mild") fail("nannyAge", config.penalties.nannyAge);
  if (age === "severe") fail("nannyAge", config.penalties.nannyAgeSevere);
  const languages = wants.languages ?? [];
  if (
    languages.length > 0 &&
    !languages.some((language) => candidate.languages.includes(language))
  )
    fail("languages", config.penalties.languages);

  return {
    multiplier: Math.max(config.penaltyFloor, multiplier),
    unmet: Object.freeze(failed.filter((key) => !HIDDEN_KEYS.has(key))),
  };
}
