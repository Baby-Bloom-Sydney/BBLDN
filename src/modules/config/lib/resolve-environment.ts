// dev · preview · prod from VERCEL_ENV (06 §2.1). Fail closed when VERCEL_ENV is absent on a production runtime
// (a non-Vercel host, a container run outside Vercel): NODE_ENV=production selects the prod column. A `next build`
// (Next sets NEXT_PHASE=phase-production-build in the build process) proves nothing about the runtime, so it
// validates against the dev column like a laptop or CI does.
import type { Environment } from "../types";

const BUILD_PHASE = "phase-production-build";

export function resolveEnvironment(
  raw: Readonly<Record<string, string | undefined>>,
): Environment {
  const vercelEnv = raw.VERCEL_ENV;
  if (vercelEnv === "production" || vercelEnv === "preview") return vercelEnv;
  if (raw.NODE_ENV === "production" && raw.NEXT_PHASE !== BUILD_PHASE)
    return "production";
  return "development";
}
