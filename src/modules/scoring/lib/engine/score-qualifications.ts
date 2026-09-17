// Layer 1, qualifications (03 §7.1 "the engine reads rungs, never names"): the rung as a share of the ladder's
// top rung, plus a capped certification bonus.
import type { Candidate, MatchingConfig } from "../../types";

const MAX = 100;
const RUNG_SHARE = 80;
const CERT_POINTS = 5;
const CERT_CAP = 20;

export function scoreQualifications(
  candidate: Candidate,
  config: MatchingConfig,
): number {
  const top = Math.max(...config.qualificationLadder.map((rung) => rung.rung));
  const rungPoints =
    top <= 0
      ? 0
      : Math.round(
          (Math.min(candidate.qualificationRung, top) / top) * RUNG_SHARE,
        );
  const certPoints = Math.min(
    CERT_CAP,
    candidate.certifications.length * CERT_POINTS,
  );
  return Math.min(MAX, rungPoints + certPoints);
}
