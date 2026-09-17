// The composition root (03 §9.5 "injected at boot in src/instrumentation.ts"): every port that has a real
// inside is bound here, in dependency order — the unit of work first (ADR-127), `auth` joined to it, then the
// ports built over `auth`'s data port, then the service seams, and last the journey ports that stand on them.
// Every binding is chosen by the parsed env (05 §3 rule 1); a port left on its fail-closed default carries its
// reason on the report, never silence.
//
// Order is load-bearing twice over: `scoring` before `matching`, because `matching` is the engine's only caller
// (03 §7.2), and `call-layer` after `scheduling` and `comms`, because its orchestrator holds both.
import type { ParsedEnv } from "@/modules/config";
import type { BootReport } from "./types";
import { wireAreas } from "./wire-areas";
import { wireAuth } from "./wire-auth";
import { wireCallLayer } from "./wire-call-layer";
import { wireComms } from "./wire-comms";
import { wireConsent } from "./wire-consent";
import { wireEvents } from "./wire-events";
import { wireMatching } from "./wire-matching";
import { wireParentProfileStore } from "./wire-parent-profile-store";
import { wireRateLimiter } from "./wire-rate-limiter";
import { wireScheduling } from "./wire-scheduling";
import { wireScoring } from "./wire-scoring";
import { wireUnitOfWork } from "./wire-unit-of-work";

export function wirePorts(env: ParsedEnv): BootReport {
  const unitOfWork = wireUnitOfWork();
  return Object.freeze([
    unitOfWork.report,
    wireAuth(unitOfWork.binding.join),
    wireEvents(env.environment),
    wireConsent(),
    wireRateLimiter(env.environment),
    wireAreas(env.server.AREAS_SOURCE),
    wireComms(env.server.EMAIL_PROVIDER),
    wireScheduling(),
    wireScoring(),
    wireMatching(),
    wireCallLayer(),
    wireParentProfileStore(),
  ]);
}
