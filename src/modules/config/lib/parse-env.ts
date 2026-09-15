// The one parse (01 §3.3): every name of the registry, required per the environment's 06 §2.5 column, then the
// cross-field guards; one EnvInvalidError listing every missing or malformed NAME. Returns the frozen split.
import type {
  EnvColumn,
  Environment,
  ParsedEnv,
  PublicEnv,
  ServerEnv,
} from "../types";
import { buildEnvSchema } from "./build-env-schema";
import { EnvInvalidError } from "./env-invalid-error";
import { ENV_SCHEMA } from "./env-schema";
import { refineEnv } from "./refine-env";
import { resolveEnvironment } from "./resolve-environment";

const COLUMN_FOR: Readonly<Record<Environment, EnvColumn>> = {
  development: "dev",
  preview: "preview",
  production: "prod",
};

function issueNames(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>,
): string[] {
  return [...new Set(issues.map((issue) => String(issue.path[0])))];
}

function split(
  values: Readonly<Record<string, unknown>>,
  scope: "public" | "server",
): Readonly<Record<string, unknown>> {
  const picked: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(ENV_SCHEMA.entries))
    if (entry.scope === scope) picked[name] = values[name];
  return Object.freeze(picked);
}

export function parseEnv(
  raw: Readonly<Record<string, string | undefined>>,
): ParsedEnv {
  const input = { ...raw, NODE_ENV: raw.NODE_ENV ?? "development" };
  const environment = resolveEnvironment(input);
  const result = buildEnvSchema(
    ENV_SCHEMA.entries,
    COLUMN_FOR[environment],
  ).safeParse(input);
  const names = result.success
    ? refineEnv(result.data, environment)
    : issueNames(result.error.issues);
  if (!result.success || names.length > 0)
    throw new EnvInvalidError(environment, names);
  return Object.freeze({
    environment,
    public: split(result.data, "public") as PublicEnv,
    server: split(result.data, "server") as ServerEnv,
  });
}
