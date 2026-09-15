// The client-safe half of the same schema (01 §3.3), over the PUBLIC table only: requiredness by the preview column
// when NODE_ENV is production (a build), the dev column otherwise. A missing public name fails the build. This
// module's import graph never touches lib/env-schema.ts (the server names) — the config.env suite pins that.
import type { PublicEnv } from "../types";
import { buildEnvSchema } from "./build-env-schema";
import { EnvInvalidError } from "./env-invalid-error";
import { PUBLIC_ENV_ENTRIES } from "./public-env-schema";

export function parsePublicEnv(
  raw: Readonly<Record<string, string | undefined>>,
): PublicEnv {
  const nodeEnv = raw.NODE_ENV ?? "development";
  const column = nodeEnv === "production" ? "preview" : "dev";
  const result = buildEnvSchema(PUBLIC_ENV_ENTRIES, column).safeParse({
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
  for (const name of Object.keys(PUBLIC_ENV_ENTRIES))
    values[name] = result.data[name];
  return Object.freeze(values) as PublicEnv;
}
