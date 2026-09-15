// The client-safe half of the same schema (01 §3.3): public names only, requiredness by the preview column when
// NODE_ENV is production (a build), the dev column otherwise. A missing public name fails the build.
import type { PublicEnv } from "../types";
import { buildEnvSchema } from "./build-env-schema";
import { EnvInvalidError } from "./env-invalid-error";
import { ENV_SCHEMA } from "./env-schema";

export function parsePublicEnv(
  raw: Readonly<Record<string, string | undefined>>,
): PublicEnv {
  const nodeEnv = raw.NODE_ENV ?? "development";
  const column = nodeEnv === "production" ? "preview" : "dev";
  const result = buildEnvSchema({ scope: "public", column }).safeParse({
    ...raw,
    NODE_ENV: nodeEnv,
  });
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new EnvInvalidError(`public/${nodeEnv}`, names);
  }
  const values: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(ENV_SCHEMA.entries))
    if (entry.scope === "public") values[name] = result.data[name];
  return Object.freeze(values) as PublicEnv;
}
