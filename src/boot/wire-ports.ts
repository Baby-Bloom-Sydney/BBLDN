// The composition root (03 §9.5 "injected at boot in src/instrumentation.ts"): every port that has a real
// inside is bound here, in dependency order — the unit of work first (ADR-127), `auth` joined to it, then the
// ports built over `auth`'s data port, then the service seams, and last the journey ports that stand on them.
// Every binding is chosen by the parsed env (05 §3 rule 1); a port left on its fail-closed default carries its
// reason on the report, never silence.
//
// Order is load-bearing three times over: `scoring` before `matching`, because `matching` is the engine's only
// caller (03 §7.2); `call-layer` after `scheduling` and `comms`, because its orchestrator holds both; and
// `positions` after `areas`, whose provider answers P-2's service-area precondition, and after `call-layer`,
// whose C rows P-2 and P-7 cascade into through the registry (03 §2.4). `payments` is last and its order is
// not load-bearing: it holds the module-level provider binding rather than a provider object, so an unconfigured
// provider is a fail-closed `Result` at call time, not a null at wire time.
import { URLS } from "@/modules/config";
import type { ParsedEnv } from "@/modules/config";
import type { BootReport } from "./types";
import { unwiredPorts } from "./unwired-ports";
import { wireAreas } from "./wire-areas";
import { wireAuth } from "./wire-auth";
import { wireCallLayer } from "./wire-call-layer";
import { wireComms } from "./wire-comms";
import { wireConnections } from "./wire-connections";
import { wireConsent } from "./wire-consent";
import { wireEvents } from "./wire-events";
import { wireMatching } from "./wire-matching";
import { wireParentProfileStore } from "./wire-parent-profile-store";
import { wireNannyOnboarding } from "./wire-nanny-onboarding";
import { wireVerification } from "./wire-verification";
import { wireApp } from "./wire-app";
import { wirePayments } from "./wire-payments";
import { wirePlacements } from "./wire-placements";
import { wirePositions } from "./wire-positions";
import { wirePurchaseProvider } from "./wire-purchase-paths";
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
    // `positions` first, then the two slices whose cascades dispatch into its P rows (03 §2.1). The order is
    // not load-bearing — `registerSlice` is last-wins and `positionFacts` is read at run time, not at wire
    // time — but the file reads in dependency order and there is no reason to be the exception.
    wirePositions(),
    wirePlacements(),
    wireConnections(),
    wireParentProfileStore(),
    // `onboarding-nanny`'s two stores (L-008 `2a`) — like the parent profile store, a feature module's binding whose
    // definers are a property of the applied schema, which is boot's to know.
    wireNannyOnboarding(),
    // `verification` + `vetting-providers` after `onboarding-nanny`, whose account store it injects as the
    // contact writer (L-008 `2b`, ADR-154); not load-bearing at wire time — the binding is read at call time.
    ...wireVerification(),
    // `purchase-paths` before `payments` for readability only — `payments` holds the module-level provider
    // binding, not a provider object, so an unconfigured provider is a fail-closed `Result` at call time.
    wirePurchaseProvider(
      env.server.PURCHASE_PROVIDER,
      env.environment,
      env.server.STUB_EVENT_SECRET,
      URLS.app,
    ),
    wirePayments(),
    // `app/child-linking` last: it injects `payments.startTrial` and the spine's `set_access_window`, so the
    // money port is wired before it. Neither is load-bearing at wire time — both are closures over module-level
    // bindings, which fail closed at call time — but the reading order is the dependency order.
    wireApp(),
    // Last, and they bind nothing: the two ports boot deliberately leaves on their fail-closed default, stated
    // so the report can never be read as "boot forgot" (REVIEW-2, code-review HIGH-1).
    ...unwiredPorts(),
  ]);
}
