// dev · preview · prod from VERCEL_ENV (06 §2.1); anything else (a laptop, CI, tests) is development.
import type { Environment } from "../types";

export function resolveEnvironment(
  raw: Readonly<Record<string, string | undefined>>,
): Environment {
  const vercelEnv = raw.VERCEL_ENV;
  if (vercelEnv === "production" || vercelEnv === "preview") return vercelEnv;
  return "development";
}
