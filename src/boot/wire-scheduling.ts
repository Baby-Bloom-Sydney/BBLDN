// `scheduling` (03 §3; ADR-074) — there is no real inside yet (no store over `bookings` / `availability_rules`),
// so the in-memory stub is the only implementation. It is installed **outside production only**: an in-memory
// calendar on a serverless runtime forgets every booking on a cold start and tells no one, which on a real
// family's call is a silent loss, not a stub. Production stays on the fail-closed default until the real inside
// lands, and says so. Selection is by the resolved environment (05 §3 rule 1), never by an import edit.
import type { Environment } from "@/modules/config";
import {
  configureScheduling,
  createSchedulingStub,
} from "@/modules/scheduling";
import type { PortWiring } from "./types";

const NO_INSIDE =
  "no real inside yet (no store over bookings / availability_rules — F-b README gap 4)";

export function wireScheduling(environment: Environment): PortWiring {
  if (environment === "production")
    return {
      port: "scheduling",
      binding: "unconfigured",
      reason: `${NO_INSIDE}; the in-memory stub is refused in production because a cold start would drop live bookings silently`,
    };
  configureScheduling(createSchedulingStub());
  return {
    port: "scheduling",
    binding: "in-memory stub",
    reason: `${NO_INSIDE}; the stub forgets on every cold start — preview and development only`,
  };
}
