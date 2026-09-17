// Layer 1 assembled (03 §7.1): the six weighted parts of `MATCHING.weights`, 0–100.
import type { Candidate, MatchingConfig, PositionInput } from "../../types";
import { scoreExperience } from "./score-experience";
import { scoreLocation } from "./score-location";
import { scoreQualifications } from "./score-qualifications";
import { scoreRoleFit } from "./score-role-fit";
import { scoreSchedule } from "./score-schedule";
import { scoreSupportFit } from "./score-support-fit";

export type QualityBase = {
  readonly base: number;
  readonly scheduleOverlapPct: number | null;
};

export function qualityBase(
  position: PositionInput,
  candidate: Candidate,
  distanceKm: number | null,
  config: MatchingConfig,
): QualityBase {
  const { weights } = config;
  const schedule = scoreSchedule(
    position.schedule,
    candidate.availability,
    config,
  );
  const base =
    scoreLocation(distanceKm, candidate.hasCar, config) * weights.location +
    schedule.score * weights.schedule +
    scoreExperience(position, candidate) * weights.experience +
    scoreRoleFit(position, candidate) * weights.roleFit +
    scoreQualifications(candidate, config) * weights.qualifications +
    scoreSupportFit(position, candidate) * weights.supportFit;
  return { base, scheduleOverlapPct: schedule.overlapPct };
}
