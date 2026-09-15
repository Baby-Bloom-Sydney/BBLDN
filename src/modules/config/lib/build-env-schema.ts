// Builds the one zod object schema (01 §3.3) from the registry for a scope and a 06 §2.5 column. A name is
// required when its mark for that column is ● and it is not a boolean (booleans default in code — 01 §3.4).
import { z } from "zod";
import type { EnvColumn, EnvScope } from "../types";
import { ENV_SCHEMA } from "./env-schema";
import { envValueSchema } from "./env-value-schema";

export function buildEnvSchema(options: {
  readonly scope: EnvScope | "all";
  readonly column: EnvColumn;
}): z.ZodObject<Record<string, z.ZodType<unknown>>> {
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const [name, entry] of Object.entries(ENV_SCHEMA.entries)) {
    if (options.scope !== "all" && entry.scope !== options.scope) continue;
    const required = entry[options.column] === "●" && entry.kind !== "boolean";
    shape[name] = envValueSchema(entry, required);
  }
  return z.object(shape);
}
